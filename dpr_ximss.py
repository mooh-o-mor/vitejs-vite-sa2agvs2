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
from xml.etree import ElementTree as ET

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
        detect_report_type, extract_fields, extract_vessel_name,
        parse_date_from_field3, build_coord_raw, parse_coords, detect_branch,
    )
except ImportError as e:
    sys.exit(f"Не найден dpr_parser.py: {e}")

from ports_lookup import load_ports, lookup_port

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
                          verify=False, timeout=30)
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

    def get_unseen_uids(self, limit=0):
        xml = f"""<XIMSS>
  <folderBrowse folder="{FOLDER_ID}" id="11">
    <index from="0" till="499"/>
  </folderBrowse>
</XIMSS>"""
        root = self.call(xml)
        uids = [int(r.get("UID")) for r in root.findall(f".//folderReport[@folder='{FOLDER_ID}'][@id='11']")
                if "Seen" not in r.findtext("FLAGS", "") and r.get("UID")]
        log.info(f"Непрочитанных: {len(uids)}")
        if limit:
            uids = uids[:limit]
            log.info(f"Лимит: {limit}")
        return uids

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

    def mark_seen(self, uid):
        self.call(f"""<XIMSS>
  <messageMark folder="{FOLDER_ID}" flags="Seen" id="30">
    <UID>{uid}</UID>
  </messageMark>
</XIMSS>""")


# ── Парсинг → vessel_dpr ─────────────────────────────────────────────────────

VESSEL_TYPE_PREFIXES = {
    "мвс", "ппб", "сбс", "рвк", "б/с", "с/б", "ас", "вс",
    "асптр", "мсс", "мфасс", "пкс", "мтб", "гс", "кп",
}


def _clean_name(raw: str) -> str:
    """Очищает имя судна от типа-префикса и email-мусора из reply-писем."""
    # 1. Убрать email + " wrote:" из reply-писем
    s = re.sub(r"<[^>]+@[^>]+>\s*(wrote:?)?", "", raw, flags=re.IGNORECASE)
    # 2. Заменить кавычки на пробел ДО токенизации — иначе «СЛОВО» склеивается
    #    с предыдущим токеном при удалении кавычки: МФАСС«СП → МФАСС СП → ✓
    s = re.sub(r'[«»""\']+', " ", s)
    # 3. Убрать тип судна в начале строки (одно слово/аббревиатура из списка)
    tokens = s.strip().split()
    while tokens and tokens[0].lower().rstrip(".") in VESSEL_TYPE_PREFIXES:
        tokens.pop(0)
    # 4. Привести к нижнему регистру, убрать лишние пробелы
    return re.sub(r"\s{2,}", " ", " ".join(tokens)).strip().lower()

def _extract_time(f3):
    m = re.search(r"(\d{2}[:.]\d{2}\s*(?:МСК|UTC|мск)?)", f3)
    return m.group(1).strip() if m else ""

def parse_to_vessel_dpr(subject, sender, body, uid):
    if not body.strip():
        log.warning("  Пустое тело — пропускаем")
        return None

    dpr_type = detect_report_type(subject, body[:300])
    fields   = extract_fields(body)
    if not fields:
        log.warning("  Поля не найдены — пропускаем")
        return None

    vessel_name = _clean_name(extract_vessel_name(fields, sender, subject) or "")
    if not vessel_name:
        log.warning("  Название судна не определено — пропускаем")
        return None

    f3          = fields.get("3", "")
    report_date = parse_date_from_field3(f3) or date.today()
    report_time = _extract_time(f3)
    coord_raw   = build_coord_raw(fields, dpr_type)
    lat, lng    = parse_coords(fields.get("4", ""))
    # Фолбэк: если координаты не распарсились — ищем в ports.ts
    if lat is None and coord_raw:
        lat, lng = lookup_port(coord_raw, PORTS)
        if lat is None:
            log.warning(f"  Не найден порт: {coord_raw!r}")
    branch      = detect_branch(vessel_name, sender, body[:500])

    log.info(f"  Судно: {vessel_name!r}  Дата: {report_date}  Тип: {dpr_type}")

    return {
        "vessel_name":   vessel_name,
        "branch":        branch or None,
        "dpr_type":      dpr_type,
        "report_date":   report_date.isoformat(),
        "report_time":   report_time or None,
        "coord_raw":     coord_raw or None,
        "lat":           lat,
        "lng":           lng,
        "fields_json":   fields,
        "email_uid":     uid,
        "email_subject": subject or None,
        "email_from":    sender or None,
        "uploaded_at":   datetime.now(timezone.utc).isoformat(),
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

    uids = ximss.get_unseen_uids(limit=args.limit)
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

            record = parse_to_vessel_dpr(subject, sender, body, uid)
            if record is None:
                skip += 1
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
            log.error(f"  Ошибка UID {uid}: {e}")
            fail += 1

    print(f"\n{'[DRY RUN] ' if args.dry_run else ''}Итог: {ok} записано, {skip} пропущено, {fail} ошибок")


if __name__ == "__main__":
    main()
