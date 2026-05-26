"""
dpr_ximss.py — Автоматический сбор ДПР с судов из почты → Supabase vessel_dpr

Что делает:
  1. Логин через Selenium (headless)
  2. Читает непрочитанные письма из папки !ДИСП
  3. Парсит каждое: все пронумерованные поля → fields_json
  4. Записывает в таблицу vessel_dpr
  5. Помечает письмо как прочитанное

Запуск:
  source venv/bin/activate
  python dpr_ximss.py --dry-run
  python dpr_ximss.py --dry-run --limit 5
  SUPABASE_KEY=eyJ... python dpr_ximss.py

Cron каждые 4 часа:
  0 */4 * * * cd ~/email_parser && source venv/bin/activate && python dpr_ximss.py >> logs/dpr.log 2>&1
"""

import argparse, json, logging, os, re, sys, time
from datetime import date, datetime, timezone
from typing import Optional
from xml.etree import ElementTree as ET

# Загружаем .env если есть
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
except ImportError:
    pass

import requests, urllib3
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait
from webdriver_manager.chrome import ChromeDriverManager

urllib3.disable_warnings()

BASE         = os.environ.get("XIMSS_BASE",    "https://mail.morspas.ru")
LOGIN        = os.environ.get("XIMSS_LOGIN",   "")
PASSWORD     = os.environ.get("XIMSS_PASS",    "")
FOLDER_ID    = os.environ.get("XIMSS_FOLDER_ID",   "1694824")
FOLDER_NAME  = os.environ.get("XIMSS_FOLDER_NAME", "INBOX/!ДИСП")
SUPABASE_URL = os.environ.get("SUPABASE_URL",  "https://otjiwxvszomwpqmwusqd.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY",  "")

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)s  %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger(__name__)

sys.path.insert(0, os.path.dirname(__file__))
try:
    from dpr_parser import (
        detect_report_type, extract_fields, extract_fields_doc_form,
        extract_vessel_name, parse_date_from_field3, build_coord_raw,
        parse_coords, detect_branch,
        extract_all_text_from_msg, extract_msg_time,
        parse_supplies_numeric, parse_weather, parse_course_speed,
        parse_eta, parse_power_source, parse_port_status, parse_crew,
    )
except ImportError as e:
    sys.exit(f"Не найден dpr_parser.py: {e}")

from ports_lookup import load_ports, lookup_port

# Справочник флота из !fleet.xlsx
try:
    from fleet_lookup import resolve_vessel, get_canonical_name, get_vessel_type
    _HAS_FLEET_LOOKUP = True
except ImportError:
    _HAS_FLEET_LOOKUP = False
    def resolve_vessel(name, fields=None): return None   # type: ignore
    def get_canonical_name(name, fields=None): return name   # type: ignore
    def get_vessel_type(name, fields=None): return ""   # type: ignore

# Загружаем порты один раз при старте
_PORTS_TS = os.path.join(os.path.dirname(__file__), "src", "lib", "ports.ts")
_PORTS_EXTRA = os.path.join(os.path.dirname(__file__), "ports_extra.json")
PORTS = load_ports(_PORTS_TS, _PORTS_EXTRA) if os.path.exists(_PORTS_TS) else {}
if PORTS:
    log.info(f"Загружено портов: {len(PORTS)}")
else:
    log.warning("ports.ts не найден — координаты портов недоступны")


# ── Selenium логин ───────────────────────────────────────────────────────────

def get_session():
    log.info("Запуск браузера (headless)...")
    opts = webdriver.ChromeOptions()
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--headless")
    opts.set_capability("goog:loggingPrefs", {"performance": "ALL"})

    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=opts)
    driver.get(f"{BASE}/?Skin=cg-web#/login")
    time.sleep(3)
    WebDriverWait(driver, 15).until(
        EC.presence_of_element_located((By.CSS_SELECTOR, "[data-test-id='login-input-username-field']"))
    ).send_keys(LOGIN + Keys.RETURN)
    time.sleep(2)
    WebDriverWait(driver, 10).until(
        EC.presence_of_element_located((By.CSS_SELECTOR, "[data-test-id='login-input-password-field']"))
    ).send_keys(PASSWORD + Keys.RETURN)
    time.sleep(5)

    cookies = {c["name"]: c["value"] for c in driver.get_cookies()}
    logs    = driver.get_log("performance")
    driver.quit()

    session_id, max_seq = None, 0
    for entry in logs:
        msg = json.loads(entry["message"])["message"]
        method = msg["method"]
        if method == "Network.requestWillBeSent":
            url = msg["params"]["request"].get("url", "")
            if "morspas.ru" in url:
                log.debug(f"  [HTTP ] {url[:140]}")
            if "/Session/" in url and not session_id:
                session_id = url.split("/Session/")[1].split("/")[0]
            if "reqSeq=" in url:
                seq_val = int(url.split("reqSeq=")[1].split("&")[0])
                max_seq = max(max_seq, seq_val)
                log.debug(f"  [SEQ  ] HTTP reqSeq={seq_val}")
        elif method == "Network.webSocketCreated":
            ws_url = msg["params"].get("url", "")
            log.debug(f"  [WS   ] created {ws_url[:140]}")
        elif method in ("Network.webSocketFrameSent", "Network.webSocketFrameReceived"):
            payload = (msg["params"].get("response") or msg["params"].get("request") or {})
            data = payload.get("payloadData", "")[:200]
            if data:
                log.debug(f"  [WS {method[-4:]}] {data}")
            # Try to extract reqSeq from WS XML payload
            m = re.search(r'reqSeq="(\d+)"', data) or re.search(r'"reqSeq"\s*:\s*(\d+)', data)
            if m:
                seq_val = int(m.group(1))
                max_seq = max(max_seq, seq_val)
                log.debug(f"  [SEQ  ] WS reqSeq={seq_val}")

    if not session_id:
        raise RuntimeError("Не удалось получить session ID")
    log.info(f"Сессия: {session_id}  max_seq (HTTP+WS): {max_seq}")
    return session_id, cookies, max_seq


# ── XIMSS API ────────────────────────────────────────────────────────────────

class XIMSSSession:
    def __init__(self, session_id, cookies, start_seq):
        self.cookies = cookies
        self.seq     = start_seq   # next call will use start_seq + 1
        self.url     = f"{BASE}/Session/{session_id}/sync"

    def call(self, xml):
        self.seq += 1
        seq = self.seq
        # XIMSS protocol requires reqSeq BOTH in the URL query string AND as an
        # attribute on the root <XIMSS> element.  Without it in the body the server
        # treats the request as sequence-0 and raises "XIMSS request sequence error".
        if "<XIMSS>" in xml:
            xml = xml.replace("<XIMSS>", f'<XIMSS reqSeq="{seq}">', 1)
        r = requests.post(f"{self.url}?reqSeq={seq}", data=xml,
                          cookies=self.cookies, headers={"Content-Type": "text/xml"},
                          verify=False, timeout=90)
        log.debug(f"  → reqSeq={seq}  HTTP {r.status_code}")
        if not r.ok:
            log.error(f"  ← {r.status_code} {r.text[:300]}")
        r.raise_for_status()
        return ET.fromstring(r.text)

    def open_folder(self):
        xml = f"""<XIMSS>
  <folderOpen mailbox="{FOLDER_NAME}" sortField="INTERNALDATE"
              sortOrder="desc" folder="{FOLDER_ID}" id="10">
    <field>FLAGS</field><field>E-From</field><field>Subject</field>
    <field>INTERNALDATE</field><field>SIZE</field>
  </folderOpen>
</XIMSS>"""
        root = self.call(xml)
        r = root.find(f".//folderReport[@folder='{FOLDER_ID}'][@mode='init']")
        if r is not None:
            log.info(f"Папка !ДИСП: {r.get('messages','?')} писем, {r.get('unseen','?')} непрочитанных")

    def get_today_uids(self, limit=0):
        """Возвращает UID сообщений за сегодня (по INTERNALDATE), игнорируя флаг Seen."""
        today = date.today().strftime("%Y%m%d")
        xml = f"""<XIMSS>
  <folderBrowse folder="{FOLDER_ID}" id="11">
    <index from="0" till="499"/>
  </folderBrowse>
</XIMSS>"""
        root = self.call(xml)
        uids = []
        for r in root.findall(f".//folderReport[@folder='{FOLDER_ID}'][@id='11']"):
            uid = r.get("UID")
            if not uid:
                continue
            # INTERNALDATE text: "20260525T051440Z"  localTime attr: "20260525T081440"
            internaldate_el = r.find("INTERNALDATE")
            internaldate    = (internaldate_el.text or "") if internaldate_el is not None else ""
            local_time      = (internaldate_el.get("localTime", "") if internaldate_el is not None else "")
            if internaldate.startswith(today) or local_time.startswith(today):
                uids.append(int(uid))
        log.info(f"Сообщений за {today}: {len(uids)}")
        if limit:
            uids = uids[:limit]
            log.info(f"Лимит: {limit}")
        return uids

    # Обратная совместимость
    def get_unseen_uids(self, limit=0):
        return self.get_today_uids(limit=limit)

    def read_message(self, uid):
        xml = f"""<XIMSS>
  <folderRead mode="text" folder="{FOLDER_ID}" UID="{uid}"
              totalSizeLimit="-1" id="20"/>
</XIMSS>"""
        root  = self.call(xml)
        email = root.find(".//EMail")
        if email is None:
            return "", "", "", ""
        subject  = email.findtext("Subject", "")
        sender   = email.findtext("From", "")
        date_str = email.findtext("Date", "")
        body = ""
        for mime in email.findall(".//MIME"):
            text = (mime.text or "").strip()
            if text and not text.startswith("<") and not text.startswith("<!"):
                body = text
                break
        return subject, sender, date_str, body

    def download_raw_message(self, uid) -> Optional[bytes]:
        """
        Пытается извлечь содержимое MSG-вложения через XIMSS mode="source".
        XIMSS не раскрывает бинарные вложения — это работает только для писем,
        где само тело является OLE/CFB MSG-файлом (переадресованные письма).
        Для обычных .doc/.docx вложений возвращает None.
        """
        xml_src = f"""<XIMSS>
  <folderRead mode="source" folder="{FOLDER_ID}" UID="{uid}"
              totalSizeLimit="-1" id="22"/>
</XIMSS>"""
        try:
            root = self.call(xml_src)
            email_el = root.find(".//EMail")
            if email_el is None:
                return None
            # В ряде писем XIMSS возвращает сырой RFC-822 источник в text() элемента EMail
            email_text = (email_el.text or "").strip()
            if len(email_text) > 500:
                log.info(f"  Raw MSG (mode=source, {len(email_text)} chars)")
                return email_text.encode("utf-8", errors="replace")
        except Exception as e:
            log.debug(f"  download_raw error: {e}")
        return None

    def mark_seen(self, uid):
        self.call(f"""<XIMSS>
  <messageMark folder="{FOLDER_ID}" flags="Seen" id="30">
    <UID>{uid}</UID>
  </messageMark>
</XIMSS>""")


# ── Филиал из fleet.xlsx ────────────────────────────────────────────────────

# Полное название Филиала из fleet.xlsx → аббревиатура
_BRANCH_FROM_XLSX: dict[str, str] = {
    "Балтийский":         "БЛТФ",
    "Северный":           "СВРФ",
    "Приморский":         "ПРМФ",
    "Сахалинский":        "СХЛФ",
    "Каспийский":         "КФ",
    "Азово-Черноморский": "ЧМФ",
    "Камчатский":         "ДВНФ",
    "Калининградский":    "КЛНФ",
    "Тверской":           "ТВФ",
    "Поволжский":         "ПВФ",
}


# ── Парсинг → vessel_dpr ─────────────────────────────────────────────────────

VESSEL_TYPE_PREFIXES = {
    "мвс", "ппб", "сбс", "рвк", "б/с", "с/б", "с/б", "ас", "вс",
    "асптр", "мсс", "мфасс", "масс", "пкс", "мтб", "гс", "кп", "мб",
}


def _clean_name(raw: str) -> str:
    """Очищает имя судна от типа-префикса и email-мусора из reply-писем."""
    # 1. Убрать email + " wrote:" из reply-писем
    s = re.sub(r"<[^>]+@[^>]+>\s*(wrote:?)?", "", raw, flags=re.IGNORECASE)
    # 2. Заменить кавычки на пробел ДО токенизации — иначе «СЛОВО» склеивается
    #    с предыдущим токеном при удалении кавычки: МФАСС«СП → МФАСС СП → ✓
    s = re.sub(r'[«»""\']+', " ", s)
    # 2b. Если тип судна слит с именем без пробела (МФАСССпасатель → МФАСС Спасатель).
    #     Применяем только к длинным префиксам, чтобы не разрезать случайные слова.
    s = re.sub(r"(?i)(мфасс|масс\b|асптр|мфассмасс)(?=[А-ЯЁа-яё])", r"\1 ", s)
    # 3. Убрать тип судна в начале строки (одно слово/аббревиатура из списка)
    tokens = s.strip().split()
    while tokens and tokens[0].lower().rstrip(".") in VESSEL_TYPE_PREFIXES:
        tokens.pop(0)
    # 4. Привести к нижнему регистру, убрать лишние пробелы и хвостовые точки
    name = re.sub(r"\s{2,}", " ", " ".join(tokens)).strip().lower()
    name = re.sub(r"[\s.]+$", "", name)   # хвостовые пробелы и точки
    return name

def _extract_time(f3):
    m = re.search(r"(\d{2}[:.]\d{2}\s*(?:МСК|UTC|мск)?)", f3)
    return m.group(1).strip() if m else ""

def parse_to_vessel_dpr(subject, sender, body, uid, raw_msg=None):
    """Парсит ДПР в формат vessel_dpr. Приоритет: вложения MSG → тело письма."""
    if not body.strip() and not raw_msg:
        log.warning("  Пустое тело и нет raw MSG — пропускаем")
        return None

    is_doc_form = False
    dpr_type = ""
    msg_time = None

    # ── Попытка извлечь текст из MSG-вложений (CFB/OLE) ──
    if raw_msg:
        att_text, dpr_type, is_doc_form = extract_all_text_from_msg(
            raw_msg, subject
        )
        if att_text.strip():
            body = att_text
            log.info(f"  Текст из MSG-вложения, тип={dpr_type}, form={is_doc_form}")
        # msg_time из metadata
        msg_time = extract_msg_time(raw_msg)

    if not body.strip():
        log.warning("  Пустое тело — пропускаем")
        return None

    # ── Тип ДПР ──
    if not dpr_type:
        dpr_type = detect_report_type(subject, body[:400])

    # Пропускаем не-ДПР типы (ОТХОД, ПРИХОД, НЕПРЕДВИДЕННЫЕ, etc.)
    if dpr_type not in ("МОРЕ", "ПОРТ"):
        log.info(f"  Тип {dpr_type!r} — пропускаем")
        return None

    # ── Парсинг полей ──
    fields = extract_fields_doc_form(body) if is_doc_form else extract_fields(body)

    # ── Название судна ──
    raw_vessel_name = _clean_name(extract_vessel_name(fields, sender, subject) or "")

    # ── Разрешение канонического имени и типа из fleet.xlsx ──
    fleet_info = resolve_vessel(raw_vessel_name, fields) if raw_vessel_name else None

    # Если email-адрес дал что-то нераспознанное (напр. "s zaborshchikov"),
    # пробуем извлечь из темы письма напрямую
    if not fleet_info and raw_vessel_name:
        subj_name = _clean_name(
            re.sub(
                r"\b(дпр|море|порт|отход|приход|sea|port|dep|arr)\b"
                r"|\d{2}[./]\d{2}[./]\d{4}|\d{2}[./]\d{2}[./]\d{2}"
                r"|\d{4}[\s_]?(?:МСК|UTC)?",
                " ", subject, flags=re.I,
            ).strip(" \\-:_")
        )
        if subj_name and subj_name != raw_vessel_name:
            fi2 = resolve_vessel(subj_name, fields)
            if fi2:
                log.info(f"  Имя из темы: {raw_vessel_name!r} → {subj_name!r} → {fi2.name!r}")
                raw_vessel_name = subj_name
                fleet_info = fi2

    if fleet_info:
        vessel_name = fleet_info.name        # каноническое lowercase имя
        vessel_type_val = fleet_info.vessel_type  # lowercase тип
        if raw_vessel_name != vessel_name:
            log.info(f"  Имя судна: {raw_vessel_name!r} → {vessel_name!r} (тип: {vessel_type_val})")
    else:
        vessel_name = raw_vessel_name
        vessel_type_val = ""
        if raw_vessel_name:
            log.debug(f"  Судно не найдено в реестре флота: {raw_vessel_name!r}")

    if not fields:
        # ДПР в вложении, которое не удалось открыть.
        # Создаём минимальную запись parse_ok=False если знаем судно.
        snippet = body.replace("\n", "↵")[:200]
        log.warning(f"  Поля не найдены (вложение?). Тело: {snippet!r}")
        if not vessel_name:
            log.warning("  Судно тоже неизвестно — пропускаем")
            return None
        # Филиал
        branch = ""
        if fleet_info and fleet_info.branch:
            branch = _BRANCH_FROM_XLSX.get(fleet_info.branch, fleet_info.branch)
        if not branch:
            branch = detect_branch(vessel_name, sender, body[:500])
        log.info(f"  Судно: {vessel_name!r} (вложение не распарсено)  parse_ok=False")
        return {
            "vessel_name":   vessel_name,
            "vessel_type":   vessel_type_val or None,
            "branch":        branch or None,
            "dpr_type":      dpr_type,
            "report_date":   date.today().isoformat(),
            "report_time":   None,
            "msg_time":      msg_time,
            "status":        None,
            "coord_raw":     None,
            "lat":           None,
            "lng":           None,
            "fields_json":   {"_note": "ДПР во вложении — не распарсен"},
            "email_uid":     uid,
            "email_subject": subject or None,
            "email_from":    sender or None,
            "uploaded_at":   datetime.now(timezone.utc).isoformat(),
            "parse_ok":      False,
            "fuel_dt_amt": None, "fuel_dt_cons": None,
            "fuel_tt_amt": None, "fuel_tt_cons": None,
            "oil_amt":     None, "oil_cons":     None,
            "water_amt":   None, "water_cons":   None,
            "weather": None, "course": None,
            "speed_current": None, "distance_day": None,
            "eta_place": None, "eta_date": None,
            "power_source": None, "port_status": None,
            "crew": None,
        }

    if not vessel_name:
        log.warning("  Название судна не определено — пропускаем")
        return None

    # ── Дата ──
    f3 = fields.get("3", "")
    f3_date = parse_date_from_field3(f3)
    today = date.today()
    if f3_date and abs((today - f3_date).days) > 7:
        # Вероятная опечатка в поле 3 — используем сегодня
        log.warning(f"  Дата из п.3 {f3_date} далеко от сегодня ({today}) → используем today")
        report_date = today
    else:
        report_date = f3_date or today
    report_time = _extract_time(f3)

    # ── Координаты ──
    coord_raw = build_coord_raw(fields, dpr_type)
    lat, lng = parse_coords(fields.get("4", ""))
    if lat is None and coord_raw:
        lat, lng = lookup_port(coord_raw, PORTS)
        if lat is None:
            log.warning(f"  Не найден порт: {coord_raw!r}")

    # ── Филиал: сначала из реестра fleet.xlsx, иначе detect_branch ──
    branch = ""
    if fleet_info and fleet_info.branch:
        branch = _BRANCH_FROM_XLSX.get(fleet_info.branch, fleet_info.branch)
    if not branch:
        branch = detect_branch(vessel_name, sender, body[:500])

    # ── parse_ok: есть имя, дата/время, позиция ──
    has_name = bool(vessel_name)
    has_date = bool(report_date)
    has_pos  = bool(coord_raw or (lat is not None and lng is not None))
    parse_ok = has_name and has_date and has_pos

    # ── Новые колонки ──
    supplies = parse_supplies_numeric(fields)
    weather_val  = parse_weather(fields) if dpr_type == "МОРЕ" else None
    course, speed, distance = parse_course_speed(fields) if dpr_type == "МОРЕ" else (None, None, None)
    eta_place, eta_date_raw = parse_eta(fields) if dpr_type == "МОРЕ" else (None, None)
    # Нормализуем eta_date → ISO (Postgres date column не принимает "29.05.26")
    eta_date = None
    if eta_date_raw:
        _d = parse_date_from_field3(eta_date_raw)
        eta_date = _d.isoformat() if _d else None
    power_source = parse_power_source(fields) if dpr_type == "ПОРТ" else None
    port_status  = parse_port_status(fields) if dpr_type == "ПОРТ" else None
    crew_val = parse_crew(fields)
    status_raw = fields.get("2", "").strip()

    log.info(f"  Судно: {vessel_name!r}  Дата: {report_date}  Тип: {dpr_type}  parse_ok={parse_ok}")

    return {
        "vessel_name":   vessel_name,
        "vessel_type":   vessel_type_val or None,
        "branch":        branch or None,
        "dpr_type":      dpr_type,
        "report_date":   report_date.isoformat(),
        "report_time":   report_time or None,
        "msg_time":      msg_time,
        "status":        status_raw or None,
        "coord_raw":     coord_raw or None,
        "lat":           lat,
        "lng":           lng,
        "fields_json":   fields,
        "email_uid":     uid,
        "email_subject": subject or None,
        "email_from":    sender or None,
        "uploaded_at":   datetime.now(timezone.utc).isoformat(),
        "parse_ok":      parse_ok,
        # Запасы
        "fuel_dt_amt":   supplies.get("fuel_dt_amt"),
        "fuel_dt_cons":  supplies.get("fuel_dt_cons"),
        "fuel_tt_amt":   supplies.get("fuel_tt_amt"),
        "fuel_tt_cons":  supplies.get("fuel_tt_cons"),
        "oil_amt":       supplies.get("oil_amt"),
        "oil_cons":      supplies.get("oil_cons"),
        "water_amt":     supplies.get("water_amt"),
        "water_cons":    supplies.get("water_cons"),
        # МОРЕ
        "weather":       weather_val,
        "course":        int(course) if course is not None else None,
        "speed_current": speed,
        "distance_day":  distance,
        "eta_place":     eta_place,
        "eta_date":      eta_date,
        # ПОРТ
        "power_source":  power_source,
        "port_status":   port_status,
        # Общее
        "crew":          crew_val,
    }


# ── Запись в Supabase ────────────────────────────────────────────────────────

def upsert_vessel_dpr(sb, record):
    try:
        sb.table("vessel_dpr").upsert(
            record, on_conflict="vessel_name,dpr_type,report_date"
        ).execute()
        log.info(f"  ✓ {record['vessel_name']} / {record['report_date']} / {record['dpr_type']}")
        return True
    except Exception as e:
        log.error(f"  ✗ {e}")
        return False


# ── Интерактивное добавление портов ────────────────────────────────────────────

def add_ports_interactive() -> None:
    """Находит записи без координат и позволяет ввести их вручную."""
    if not SUPABASE_KEY:
        sys.exit("Укажите SUPABASE_KEY в .env или переменных окружения")
    from supabase import create_client
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Берём все уникальные coord_raw без lat
    res = (
        sb.table("vessel_dpr")
        .select("coord_raw")
        .is_("lat", "null")
        .neq("coord_raw", None)
        .neq("coord_raw", "")
        .execute()
    )
    if not res.data:
        print("Все записи уже имеют координаты.")
        return

    unique_raw = sorted({
        r["coord_raw"].strip()
        for r in res.data
        if r.get("coord_raw")
    })
    print(f"Найдено уникальных адресов без координат: {len(unique_raw)}\n")

    extra: dict[str, tuple[float, float]] = {}
    if os.path.exists(_PORTS_EXTRA):
        with open(_PORTS_EXTRA, encoding="utf-8") as f:
            extra = json.load(f)

    for raw in unique_raw:
        # Уже есть в extra?
        if raw.lower() in {k.lower() for k in extra}:
            continue
        # Уже есть в ports.ts?
        lat_found, _ = lookup_port(raw, PORTS)
        if lat_found is not None:
            continue

        print(f'Не найдено: "{raw}"')
        inp = input("  Введите lat,lng (или Enter чтобы пропустить): ").strip()
        if not inp:
            continue
        try:
            lat_str, lng_str = inp.split(",")
            lat_val = float(lat_str.strip())
            lng_val = float(lng_str.strip())
            extra[raw] = (lat_val, lng_val)
            print(f"  ✓ Сохранено: {lat_val}, {lng_val}")
        except (ValueError, TypeError):
            print("  ✗ Неверный формат — пропущено")
            continue

    if extra:
        with open(_PORTS_EXTRA, "w", encoding="utf-8") as f:
            json.dump(extra, f, ensure_ascii=False, indent=2)
        print(f"\n✓ Сохранено в {_PORTS_EXTRA}: {len(extra)} портов")

        # Обновляем записи в БД
        updated = 0
        for raw, (lat_val, lng_val) in extra.items():
            try:
                res = (
                    sb.table("vessel_dpr")
                    .update({"lat": lat_val, "lng": lng_val})
                    .eq("coord_raw", raw)
                    .is_("lat", "null")
                    .execute()
                )
                updated += len(res.data) if res.data else 0
            except Exception as e:
                log.error(f"  Ошибка обновления {raw!r}: {e}")
        print(f"✓ Обновлено записей в БД: {updated}")
    else:
        print("\nНовых портов не добавлено.")


# ── Точка входа ──────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description="ДПР с судов → vessel_dpr")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit",   type=int, default=0)
    ap.add_argument("--verbose", action="store_true")
    ap.add_argument("--add-ports", action="store_true",
                    help="Интерактивное добавление координат для неизвестных портов")
    args = ap.parse_args()
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    # ── Режим --add-ports ──
    if args.add_ports:
        add_ports_interactive()
        return

    if not LOGIN or not PASSWORD:
        sys.exit("Укажите XIMSS_LOGIN и XIMSS_PASS в .env или переменных окружения")

    sb = None
    if not args.dry_run:
        if not SUPABASE_KEY:
            sys.exit("Укажите SUPABASE_KEY в .env или переменных окружения")
        from supabase import create_client
        sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    session_id, cookies, last_seq = get_session()
    ximss = XIMSSSession(session_id, cookies, last_seq)
    ximss.open_folder()

    # ── Задача 4: перечень активных судов (за последние 90 дней) ──
    active_vessel_count = 0
    if sb and not args.dry_run:
        try:
            res = sb.table("vessel_dpr") \
                .select("vessel_name", count="exact") \
                .gte("report_date", (date.today() - __import__("datetime").timedelta(days=90)).isoformat()) \
                .execute()
            # Distinct by vessel_name
            names = set(r["vessel_name"] for r in (res.data or []))
            active_vessel_count = len(names)
            log.info(f"Активных судов (≤90 дней): {active_vessel_count}")
        except Exception as e:
            log.warning(f"Ошибка запроса активных судов: {e}")

    uids = ximss.get_today_uids(limit=args.limit)
    if not uids:
        log.info("Новых писем нет")
        return

    ok = fail = skip = 0
    for uid in uids:
        log.info(f"─── UID {uid} ───")
        try:
            subject, sender, _, body = ximss.read_message(uid)
            log.info(f"  От:   {sender}")
            log.info(f"  Тема: {subject!r}")

            # Скачиваем сырое сообщение ТОЛЬКО если нужно:
            # тело пустое / нет полей / есть намёк на вложение
            body_fields = extract_fields(body) if body.strip() else {}
            attachment_hint = any(
                kw in body[:400].lower()
                for kw in ("приложени", "attach", "вложен")
            )
            raw_msg = None
            if not body_fields or attachment_hint:
                try:
                    raw_msg = ximss.download_raw_message(uid)
                    if raw_msg:
                        log.info(f"  Raw MSG: {len(raw_msg)} байт")
                    else:
                        log.debug(f"  Raw MSG: пусто")
                except Exception as e:
                    log.warning(f"  Raw download failed: {e}")
            else:
                log.debug(f"  Raw download пропущен (поля найдены в теле)")

            record = parse_to_vessel_dpr(subject, sender, body, uid, raw_msg)
            if record is None:
                skip += 1
                if not args.dry_run:
                    ximss.mark_seen(uid)
                continue

            if args.dry_run:
                print(json.dumps(record, ensure_ascii=False, indent=2, default=str))
                ok += 1
            else:
                if upsert_vessel_dpr(sb, record):
                    ok += 1
                    ximss.mark_seen(uid)
                else:
                    fail += 1
        except Exception as e:
            err_str = str(e)
            log.error(f"  Ошибка UID {uid}: {e}")
            # Если сессия умерла (sequence error / 400 / SSL EOF) — переподключаемся
            if any(kw in err_str.lower() for kw in (
                "sequence error", "ssl", "eof", "connection", "timed out", "max retries"
            )) or "400 client error" in err_str.lower():
                log.info("  Переподключение к XIMSS...")
                try:
                    session_id, cookies, last_seq = get_session()
                    ximss = XIMSSSession(session_id, cookies, last_seq)
                    ximss.open_folder()
                    log.info("  Переподключение успешно — продолжаем")
                except Exception as reauth_e:
                    log.error(f"  Переподключение не удалось: {reauth_e}")
                    break
            fail += 1

    print(f"\n{'[DRY RUN] ' if args.dry_run else ''}Итог: {ok} записано, {skip} пропущено, {fail} ошибок")

    # ── Задача 5: условие остановки ──
    if sb and not args.dry_run and active_vessel_count > 0:
        try:
            res = sb.table("vessel_dpr") \
                .select("*", count="exact") \
                .eq("report_date", date.today().isoformat()) \
                .eq("parse_ok", True) \
                .execute()
            reported_today = res.count if res.count is not None else len(res.data or [])
            log.info(f"Отчитались сегодня (parse_ok=true): {reported_today} из {active_vessel_count}")
            if reported_today >= active_vessel_count:
                log.info(f"Все {active_vessel_count} судов отчитались, завершаю.")
        except Exception as e:
            log.warning(f"Ошибка проверки условия остановки: {e}")


if __name__ == "__main__":
    main()
