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
        detect_report_type, extract_fields, extract_fields_doc_form, is_doc_form_text,
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

def get_session(keep_driver=False):
    """
    Логин через Selenium → XIMSS session ID + cookies + max_seq.
    Если keep_driver=True — возвращает также driver (НЕ закрывает браузер).
    """
    log.info("Запуск браузера (headless)...")
    opts = webdriver.ChromeOptions()
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--headless")
    opts.set_capability("goog:loggingPrefs", {"performance": "ALL"})
    # Папка загрузок
    download_dir = os.path.join(os.getcwd(), "downloads")
    os.makedirs(download_dir, exist_ok=True)
    prefs = {"download.default_directory": download_dir,
             "download.prompt_for_download": False,
             "download.directory_upgrade": True}
    opts.add_experimental_option("prefs", prefs)

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

    # Ждём появления /Session/ в сетевых логах (до 20 сек)
    session_id, max_seq = None, 0
    for attempt in range(20):
        time.sleep(1)
        raw_logs = driver.get_log("performance")
        for entry in raw_logs:
            try:
                msg = json.loads(entry["message"])["message"]
                if msg["method"] == "Network.requestWillBeSent":
                    url = msg["params"]["request"].get("url", "")
                    if "/Session/" in url and not session_id:
                        session_id = url.split("/Session/")[1].split("/")[0]
                    if "reqSeq=" in url and session_id:
                        seq_val = int(url.split("reqSeq=")[1].split("&")[0])
                        max_seq = max(max_seq, seq_val)
            except Exception:
                pass
        if session_id:
            log.debug(f"  Session found after {attempt+1}s")
            break
    # Если так и не нашли — читаем полный лог ещё раз
    logs = driver.get_log("performance") if not session_id else []

    cookies = {c["name"]: c["value"] for c in driver.get_cookies()}

    if not keep_driver:
        driver.quit()
        driver = None

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
    if keep_driver:
        return session_id, cookies, max_seq, driver
    return session_id, cookies, max_seq


# ── Кеш сессии (избегаем лишних логинов) ────────────────────────────────────

_CACHE_FILE = os.path.join(os.path.dirname(__file__), "session_cache.json")
_CACHE_TTL_HOURS = 6  # сессия CommuniGate живёт несколько часов


def _save_session_cache(session_id: str, cookies: dict, max_seq: int) -> None:
    """Сохраняет сессию на диск для повторного использования."""
    try:
        data = {
            "session_id": session_id,
            "cookies": cookies,
            "max_seq": max_seq,
            "saved_at": datetime.now(timezone.utc).isoformat(),
        }
        with open(_CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f)
        log.debug(f"Сессия сохранена в кеш")
    except Exception as e:
        log.warning(f"Не удалось сохранить кеш сессии: {e}")


def _load_session_cache() -> Optional[tuple]:
    """Загружает кеш сессии. Возвращает (session_id, cookies, max_seq) или None."""
    if not os.path.exists(_CACHE_FILE):
        return None
    try:
        with open(_CACHE_FILE, encoding="utf-8") as f:
            data = json.load(f)
        saved_at = datetime.fromisoformat(data["saved_at"])
        age_hours = (datetime.now(timezone.utc) - saved_at).total_seconds() / 3600
        if age_hours > _CACHE_TTL_HOURS:
            log.debug(f"Кеш сессии устарел ({age_hours:.1f}ч > {_CACHE_TTL_HOURS}ч)")
            return None
        return data["session_id"], data["cookies"], int(data["max_seq"])
    except Exception as e:
        log.debug(f"Ошибка чтения кеша сессии: {e}")
        return None


def _test_cached_session(session_id: str, cookies: dict, max_seq: int) -> bool:
    """Проверяет сессию через folderOpen — тот же запрос что делает open_folder().
    Живая сессия → HTTP 200. Мёртвая → HTTP 4xx/5xx."""
    try:
        url = f"{BASE}/Session/{session_id}/sync"
        seq = max_seq + 1
        xml = f"""<XIMSS reqSeq="{seq}">
  <folderOpen mailbox="{FOLDER_NAME}" sortField="INTERNALDATE"
              sortOrder="desc" folder="{FOLDER_ID}" id="10">
    <field>FLAGS</field><field>INTERNALDATE</field>
  </folderOpen>
</XIMSS>"""
        r = requests.post(
            f"{url}?reqSeq={seq}", data=xml,
            cookies=cookies, headers={"Content-Type": "text/xml"},
            verify=False, timeout=10
        )
        log.debug(f"Проверка кеша: HTTP {r.status_code}")
        return r.status_code == 200
    except Exception as e:
        log.debug(f"Ошибка проверки кеша: {e}")
        return False


def get_or_create_session() -> tuple:
    """
    Возвращает (session_id, cookies, max_seq).
    Сначала пробует кешированную сессию — при неудаче делает новый логин.
    """
    cached = _load_session_cache()
    if cached:
        session_id, cookies, max_seq = cached
        log.info("Кеш сессии найден, проверяем...")
        if _test_cached_session(session_id, cookies, max_seq):
            log.info("✓ Кешированная сессия активна — логин пропускаем")
            return session_id, cookies, max_seq + 1000
        log.info("Кешированная сессия истекла, логинимся заново")

    session_id, cookies, max_seq = get_session()
    _save_session_cache(session_id, cookies, max_seq)
    return session_id, cookies, max_seq


# ── Webmail fallback для сообщений с вложениями ─────────────────────────────

def _download_attachment_via_webmail(driver, uid: int, download_dir: str) -> Optional[str]:
    """
    Открывает письмо в веб-интерфейсе, ищет ссылку на .doc/.docx,
    кликает для скачивания. Возвращает путь к скачанному файлу или None.
    """
    try:
        # Перейти на страницу письма. Формат CommuniGate:
        #   #/mail/{FOLDER_ID}/view/{UID}
        msg_url = f"{BASE}/?Skin=cg-web#/mail/{FOLDER_ID}/view/{uid}"
        driver.get(msg_url)
        time.sleep(4)

        # Ищем кнопку вложения. CommuniGate webmail рендерит вложения
        # как <button> внутри контейнера с классом _attachments_
        buttons = driver.find_elements(By.CSS_SELECTOR, "[class*='_attachments_'] button")
        target_btn = None
        for btn in buttons:
            text = (btn.text or "").strip().lower()
            if (text.endswith((".doc", ".docx", ".eml")) or
                    ".doc" in text or text.endswith(".eml")):
                target_btn = btn
                log.info(f"  Webmail: кнопка вложения {btn.text.strip()!r}")
                break

        # Фолбэк: любая кнопка с .doc или .eml в тексте
        if not target_btn:
            all_btns = driver.find_elements(By.TAG_NAME, "button")
            for btn in all_btns:
                text = (btn.text or "").strip().lower()
                if ".doc" in text or ".eml" in text:
                    target_btn = btn
                    log.info(f"  Webmail (fallback): кнопка {btn.text.strip()!r}")
                    break

        if not target_btn:
            log.warning(f"  Webmail: кнопка вложения не найдена (UID {uid})")
            return None

        # Запоминаем существующие файлы в папке загрузок
        before = set(os.listdir(download_dir))

        # Кликаем кнопку
        target_btn.click()
        time.sleep(5)

        # Ждём новый файл
        after = set(os.listdir(download_dir))
        new_files = after - before
        if new_files:
            fname = list(new_files)[0]
            filepath = os.path.join(download_dir, fname)
            log.info(f"  Webmail: скачан {fname} ({os.path.getsize(filepath)} байт)")
            return filepath

        # Иногда файл скачивается с тем же именем (перезапись) — ищем по времени
        candidates = []
        for fname in os.listdir(download_dir):
            fp = os.path.join(download_dir, fname)
            mtime = os.path.getmtime(fp)
            if time.time() - mtime < 30 and fname.lower().endswith((".doc", ".docx", ".eml")):
                candidates.append((mtime, fp))
        if candidates:
            candidates.sort(reverse=True)
            filepath = candidates[0][1]
            log.info(f"  Webmail: найден по времени {os.path.basename(filepath)} ({os.path.getsize(filepath)} байт)")
            return filepath

        log.warning(f"  Webmail: файл не появился в {download_dir}")
        return None
    except Exception as e:
        log.warning(f"  Webmail error UID {uid}: {e}")
        return None


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
        else:
            # Папка не открылась с первой попытки (накопленные ответы сессии).
            # Повторяем open_folder ещё раз.
            log.debug("  open_folder: init report не получен, повтор...")
            root2 = self.call(xml)
            r2 = root2.find(f".//folderReport[@folder='{FOLDER_ID}'][@mode='init']")
            if r2 is not None:
                log.info(f"Папка !ДИСП (retry): {r2.get('messages','?')} писем, {r2.get('unseen','?')} непрочитанных")
            else:
                log.warning("  open_folder: папка не открылась после retry")

    def get_today_uids(self, limit=0, all_uids=False):
        """Возвращает UID сообщений за сегодня (по INTERNALDATE), игнорируя флаг Seen.
        all_uids=True — возвращает ВСЕ UIDs в папке (без фильтра по дате).
        """
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
            if all_uids:
                uids.append(int(uid))
            else:
                # INTERNALDATE text: "20260525T051440Z"  localTime attr: "20260525T081440"
                internaldate_el = r.find("INTERNALDATE")
                internaldate    = (internaldate_el.text or "") if internaldate_el is not None else ""
                local_time      = (internaldate_el.get("localTime", "") if internaldate_el is not None else "")
                if internaldate.startswith(today) or local_time.startswith(today):
                    uids.append(int(uid))
        label = "всего в папке" if all_uids else f"за {today}"
        log.info(f"Сообщений {label}: {len(uids)}")
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

    def read_embedded_eml_text(self, uid) -> str:
        """
        Пытается прочитать текст из вложенного .eml (message/rfc822) через XIMSS.
        Использует partID-путь "02-01" (часть 2 → вложенный .eml, часть 1 → текст).
        Работает для "Fwd:" писем с вложением .eml (подтверждено для Ростов Великий).
        Возвращает текст тела или ''.
        """
        for part_id in ("02-01", "03-01", "02-01-01"):
            try:
                xml = f"""<XIMSS>
  <folderRead mode="text" folder="{FOLDER_ID}" UID="{uid}" partID="{part_id}"
              totalSizeLimit="-1" id="24"/>
</XIMSS>"""
                root = self.call(xml)
                resp = root.find('.//response[@id="24"]')
                if resp is not None and resp.get("errorText"):
                    continue
                email_el = root.find(".//EMail")
                if email_el is None:
                    continue
                for mime in email_el.findall(".//MIME"):
                    text = (mime.text or "").strip()
                    if text and not text.startswith("<") and not text.startswith("<!"):
                        if len(text) > 50:
                            log.info(f"  Embedded .eml text (partID={part_id}): {len(text)} chars")
                            return text
            except Exception as e:
                log.debug(f"  read_embedded_eml_text partID={part_id}: {e}")
        return ""

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
    "Каспийский":         "КСПФ",
    "Азово-Черноморский": "АЧФ",
    "Камчатский":         "КМЧФ",
    "Калининградский":    "КЛНФ",
    "Тверской":           "ТВФ",
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


def _parse_date_from_subject(subject: str) -> Optional["date"]:
    """Извлекает последнюю дату из темы письма.
    Для батчей «15, 16, 17, 18, 19.05.26» возвращает 19.05.2026."""
    if not subject:
        return None
    hits = re.findall(r"\b(\d{1,2})[./](\d{2})[./](\d{2,4})\b", subject)
    if hits:
        d, mon, y = hits[-1]
        return parse_date_from_field3(f"{d}.{mon}.{y}")
    return None


def _parse_email_date(date_str: str) -> Optional["date"]:
    """
    Парсит дату из заголовка Date email-сообщения (RFC 2822).
    Пример: 'Tue, 27 May 2026 06:15:00 +0300' → date(2026, 5, 27)
    """
    if not date_str:
        return None
    try:
        import email.utils as _email_utils
        tup = _email_utils.parsedate(date_str)
        if tup and tup[0] and tup[1] and tup[2]:
            return date(tup[0], tup[1], tup[2])
    except Exception:
        pass
    # Резервный поиск: "27 May 2026" или "27 May 26"
    MONTHS = {"jan":1,"feb":2,"mar":3,"apr":4,"may":5,"jun":6,
              "jul":7,"aug":8,"sep":9,"oct":10,"nov":11,"dec":12}
    m = re.search(r"(\d{1,2})\s+([A-Za-z]{3})\s+(\d{2,4})", date_str)
    if m:
        try:
            d = int(m.group(1))
            mon = MONTHS.get(m.group(2).lower())
            y = int(m.group(3))
            if y < 100:
                y += 2000
            if mon:
                return date(y, mon, d)
        except Exception:
            pass
    return None


def parse_to_vessel_dpr(subject, sender, body, uid, raw_msg=None, is_doc_form=False,
                        email_date: Optional["date"] = None):
    """Парсит ДПР в формат vessel_dpr. Приоритет: вложения MSG → тело письма."""
    if not body.strip() and not raw_msg:
        log.warning("  Пустое тело и нет raw MSG — пропускаем")
        return None
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
    fields = extract_fields_doc_form(body, dpr_type) if is_doc_form else extract_fields(body, dpr_type)

    # ── Название судна ──
    raw_vessel_name = _clean_name(extract_vessel_name(fields, sender, subject) or "")

    # ── Разрешение канонического имени и типа из fleet.xlsx ──
    fleet_info = resolve_vessel(raw_vessel_name, fields) if raw_vessel_name else None

    # Если поле 1 дало нераспознанное имя — пробуем email sh.*@morspas.ru
    # (защита от писем вида "1. На борт прибыли члены экипажа...")
    if not fleet_info and raw_vessel_name and sender:
        em_m = re.search(r"sh\.([^@]+)@morspas\.ru", sender, re.I)
        if em_m:
            email_name = _clean_name(em_m.group(1).replace(".", " ").replace("_", " "))
            fi_email = resolve_vessel(email_name, fields) if email_name else None
            if fi_email:
                log.info(f"  Имя из email: {raw_vessel_name!r} → {email_name!r} → {fi_email.name!r}")
                raw_vessel_name = email_name
                fleet_info = fi_email

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
        fallback_date = (email_date
                         or _parse_date_from_subject(subject)
                         or date.today())
        return {
            "vessel_name":   vessel_name,
            "vessel_type":   vessel_type_val or None,
            "branch":        branch or None,
            "dpr_type":      dpr_type,
            "report_date":   fallback_date.isoformat(),
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
            "raw_body": body or None,
        }

    if not vessel_name:
        log.warning("  Название судна не определено — пропускаем")
        return None

    # ── Дата и время ──
    # report_date: используем дату из параметров письма (надёжно, нет человеческого фактора).
    # П.3 содержит дату, введённую экипажем — может быть с опечаткой (месяц/год).
    # Порядок приоритетов:
    #   1. email_date  — дата из Date-заголовка письма (передаётся из XIMSS)
    #   2. тема письма — обычно содержит дату в явном виде
    #   3. сегодня     — абсолютный фоллбэк
    f3 = fields.get("3", "")
    if email_date:
        report_date = email_date
        log.debug(f"  Дата из письма: {report_date}")
    else:
        subj_date = _parse_date_from_subject(subject)
        if subj_date:
            report_date = subj_date
            log.debug(f"  Дата из темы: {report_date}")
        else:
            report_date = date.today()
            log.debug(f"  Дата: сегодня ({report_date})")

    # Время суток — по-прежнему из П.3 (экипаж указывает время наблюдения)
    report_time = _extract_time(f3) or _extract_time(fields.get("4", ""))

    # ── Координаты ──
    coord_raw = build_coord_raw(fields, dpr_type)
    lat, lng = parse_coords(fields.get("4", ""))
    if lat is None and coord_raw:
        lat, lng = lookup_port(coord_raw, PORTS)
    # Фолбэк: если поле 4 пустое — ищем местоположение в других полях
    # (Беклемишев: местоположение в П.10)
    if lat is None and coord_raw in ("", None):
        _LOCATION_HINT_RE = re.compile(
            r"\b(порт|причал|якорн(?:ая|ой)|рейд|пр\.|наб\.|бухта|залив|мыс|губа|пролив)\b",
            re.I,
        )
        for fn in ("10", "9", "8", "7", "6", "11", "12", "13", "14"):
            fv = fields.get(fn, "").strip()
            if fv and _LOCATION_HINT_RE.search(fv):
                # Обрезаем supplies-строки (ДТ:, М:, В:, etc.) после переноса
                loc_part = re.split(
                    r"\n\s*(?:ДТ|IFO|DT|ТТ|MGO|TT|[МM]\d*[- ]?(?:ГДГ|ВДГ|Г)?|M10|M14|TPL|ТРL|Масло|В|V|Water|Вода)\s*[:–—-]",
                    fv, maxsplit=1, flags=re.I,
                )[0].strip()
                coord_raw = loc_part
                lat, lng = lookup_port(coord_raw, PORTS)
                if lat is not None:
                    log.info(f"  Местоположение из П.{fn}: {coord_raw!r}")
                    break
                # Если порт не найден — coord_raw уже установлен, попробуем след. поле
        if lat is None and not coord_raw:
            log.warning(f"  Местоположение не найдено ни в одном поле")
        elif lat is None and coord_raw:
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
    # Фолбэк: если П.5 пустое — ищем запасы в других полях
    # (Беклемишев: запасы без номера поля между П.10 и П.12)
    _supplies_has_data = any(
        supplies.get(k) is not None
        for k in ("fuel_dt_amt", "fuel_tt_amt", "oil_amt", "water_amt")
    )
    if not _supplies_has_data:
        for fn in ("10", "8", "9", "11", "12", "13", "14"):
            fv = fields.get(fn, "").strip()
            if fv and re.search(r"\b(?:ДТ|IFO|DT|ТТ|MGO|TT|Масло|[МM]\d*[- ]?(?:ГДГ|ВДГ|Г)\b)\s*[:–—-]", fv, re.I):
                # Нашли запасы в другом поле — парсим
                fake_fields = {"5": fv}
                supplies = parse_supplies_numeric(fake_fields)
                log.info(f"  Запасы из П.{fn}")
                break
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
        # Сырой текст для репарсинга без почты
        "raw_body":      body or None,
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


# ── Репарсинг из raw_body без почты ─────────────────────────────────────────

def reparse_from_db(sb, vessel_filter: str = "", date_filter: str = "") -> None:
    """
    Перепарсивает записи vessel_dpr из сохранённого raw_body —
    без логина в почту. Обновляет все поля кроме raw_body.

    vessel_filter — имя судна (substring, lowercase) или "" для всех
    date_filter   — дата YYYY-MM-DD или "" для всех
    """
    query = sb.table("vessel_dpr").select("*").not_.is_("raw_body", "null")
    if vessel_filter:
        query = query.ilike("vessel_name", f"%{vessel_filter.lower()}%")
    if date_filter:
        query = query.eq("report_date", date_filter)
    res = query.order("report_date", desc=True).execute()

    rows = res.data or []
    log.info(f"Записей для репарсинга: {len(rows)}")
    ok = fail = skip = 0

    for row in rows:
        raw_body  = row["raw_body"]
        subject   = row.get("email_subject") or ""
        sender    = row.get("email_from") or ""
        uid       = row.get("email_uid") or 0
        v_name    = row.get("vessel_name", "?")
        r_date    = row.get("report_date", "?")

        log.info(f"  Репарсим: {v_name} / {r_date}")

        # Дата: тема письма (надёжно) → uploaded_at (дата обработки) → None
        reparse_email_date: Optional[date] = _parse_date_from_subject(subject)
        if not reparse_email_date:
            uploaded_at_str = row.get("uploaded_at", "")
            if uploaded_at_str:
                try:
                    reparse_email_date = date.fromisoformat(uploaded_at_str[:10])
                except Exception:
                    pass

        # Автодетект формата по тексту; при ошибке — fallback на второй вариант
        auto_form = is_doc_form_text(raw_body)
        record = None
        for is_form in ([auto_form, not auto_form] if auto_form else [False, True]):
            record = parse_to_vessel_dpr(subject, sender, raw_body, uid,
                                         is_doc_form=is_form,
                                         email_date=reparse_email_date)
            if record and record.get("parse_ok"):
                break

        if not record:
            log.warning(f"  ✗ {v_name} / {r_date}: не удалось перепарсить")
            fail += 1
            continue

        # Сохраняем оригинальный raw_body (parse_to_vessel_dpr мог его перезаписать)
        record["raw_body"] = raw_body

        if upsert_vessel_dpr(sb, record):
            ok += 1
        else:
            fail += 1

    print(f"\nРепарсинг завершён: {ok} обновлено, {fail} ошибок, {skip} пропущено")


# ── Заполнение raw_body из почты ────────────────────────────────────────────

def fill_raw_body(sb, ximss: "XIMSSSession") -> "XIMSSSession":
    """
    Скачивает текст письма для всех записей vessel_dpr с пустым raw_body.
    Использует email_uid для точечного запроса.
    При обрыве сессии (SSL EOF / 400) переподключается и продолжает.
    Возвращает актуальный ximss (может быть новая сессия после переподключения).
    """
    import requests as _req
    from dpr_parser import extract_fields, extract_all_text_from_msg

    def _reconnect() -> "XIMSSSession":
        log.warning("  Переподключение: создаём новую сессию...")
        sid, ck, seq = get_session()           # принудительный логин (не кэш)
        _save_session_cache(sid, ck, seq)
        xs = XIMSSSession(sid, ck, seq)
        xs.open_folder()
        log.info("  Переподключение: ✓ новая сессия готова")
        return xs

    def _fetch_text(xs, uid, subject_hint="") -> tuple[str, str, "XIMSSSession"]:
        """Читает тело письма. При сбое сессии переподключается и пробует ещё раз."""
        for attempt in range(2):
            try:
                subject, sender, _, body = xs.read_message(uid)
                return subject, body, xs
            except (_req.exceptions.SSLError, _req.exceptions.ConnectionError) as e:
                if attempt == 0:
                    log.warning(f"  UID {uid}: обрыв соединения ({type(e).__name__}), переподключаемся...")
                    xs = _reconnect()
                else:
                    raise
            except _req.exceptions.HTTPError as e:
                if e.response is not None and e.response.status_code == 400 and attempt == 0:
                    log.warning(f"  UID {uid}: 400 (сбой seq), переподключаемся...")
                    xs = _reconnect()
                else:
                    raise
        return "", "", xs   # не достижимо

    # Все записи без raw_body
    res = sb.table("vessel_dpr").select("email_uid,vessel_name,report_date,dpr_type") \
        .is_("raw_body", "null") \
        .not_.is_("email_uid", "null") \
        .execute()
    rows = res.data or []
    if not rows:
        print("Все записи уже имеют raw_body — ничего не нужно делать.")
        return ximss

    # Группируем по email_uid (один UID может дать несколько записей — разные dpr_type)
    uid_map: dict[int, list[dict]] = {}
    for row in rows:
        uid = row["email_uid"]
        uid_map.setdefault(uid, []).append(row)

    print(f"Записей без raw_body: {len(rows)} (уникальных UID: {len(uid_map)})")
    updated = skipped = failed = 0

    for uid, uid_rows in uid_map.items():
        names = ", ".join(r["vessel_name"] for r in uid_rows)
        log.info(f"  UID {uid}: {names}")

        try:
            subject, body, ximss = _fetch_text(ximss, uid)
        except Exception as e:
            log.warning(f"  UID {uid}: не удалось прочитать: {e}")
            failed += len(uid_rows)
            continue

        # Проверяем, есть ли нумерованные поля в теле
        body_fields = extract_fields(body, "") if body.strip() else {}
        raw_text = body

        # Если в теле нет полей — пробуем скачать raw MSG
        if not body_fields:
            try:
                raw_msg = ximss.download_raw_message(uid)
                if raw_msg:
                    extracted, _, _ = extract_all_text_from_msg(raw_msg, subject)
                    if extracted.strip():
                        raw_text = extracted
                        log.info(f"  UID {uid}: текст из raw MSG ({len(raw_text)} символов)")
            except Exception as e:
                log.warning(f"  UID {uid}: ошибка raw MSG: {e}")

        # Fallback: вложенный .eml через XIMSS partID
        if not raw_text.strip() or not extract_fields(raw_text, ""):
            emb_body = ximss.read_embedded_eml_text(uid)
            if emb_body:
                raw_text = emb_body
                log.info(f"  UID {uid}: текст из embedded .eml ({len(raw_text)} символов)")

        if not raw_text.strip():
            log.warning(f"  UID {uid}: пустой текст — пропускаем")
            skipped += len(uid_rows)
            continue

        # Обновляем все DB-записи с этим UID
        try:
            sb.table("vessel_dpr") \
                .update({"raw_body": raw_text}) \
                .eq("email_uid", uid) \
                .is_("raw_body", "null") \
                .execute()
            log.info(f"  UID {uid}: ✓ raw_body сохранён ({len(raw_text)} символов) для {len(uid_rows)} записи")
            updated += len(uid_rows)
        except Exception as e:
            log.error(f"  UID {uid}: ошибка обновления БД: {e}")
            failed += len(uid_rows)

    print(f"\nЗаполнение raw_body завершено: {updated} обновлено, {skipped} пропущено, {failed} ошибок")
    return ximss


# ── Точка входа ──────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description="ДПР с судов → vessel_dpr")
    ap.add_argument("--dry-run",  action="store_true")
    ap.add_argument("--limit",    type=int, default=0)
    ap.add_argument("--verbose",  action="store_true")
    ap.add_argument("--add-ports", action="store_true",
                    help="Интерактивное добавление координат для неизвестных портов")
    ap.add_argument("--uids",     type=str, default="",
                    help="Обработать конкретные UID через запятую: --uids 2018,2504")
    ap.add_argument("--reparse",  action="store_true",
                    help="Перепарсить записи из raw_body без обращения к почте")
    ap.add_argument("--vessel",   type=str, default="",
                    help="Фильтр по имени судна для --reparse (подстрока): --vessel балтика")
    ap.add_argument("--date",     type=str, default="",
                    help="Фильтр по дате для --reparse (YYYY-MM-DD): --date 2026-05-27")
    ap.add_argument("--fill-raw-body", action="store_true",
                    help="Заполнить raw_body для всех записей без него (одна сессия в почте)")
    ap.add_argument("--all-uids", action="store_true",
                    help="Обработать ВСЕ письма в папке (не только сегодняшние)")
    ap.add_argument("--truncate", action="store_true",
                    help="Очистить таблицу vessel_dpr перед обработкой (использовать с --all-uids)")
    ap.add_argument("--daemon",   action="store_true",
                    help="Daemon mode: опрос dpr_settings.run_requested каждые 60 сек")
    args = ap.parse_args()
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    # ── Режим --add-ports ──
    if args.add_ports:
        add_ports_interactive()
        return

    # ── Режим --reparse (без почты) ──
    if args.reparse:
        if not SUPABASE_KEY:
            sys.exit("Укажите SUPABASE_KEY в .env или переменных окружения")
        from supabase import create_client
        sb = create_client(SUPABASE_URL, SUPABASE_KEY)
        reparse_from_db(sb, vessel_filter=args.vessel, date_filter=args.date)
        return

    # ── Режим --fill-raw-body (одна почтовая сессия) ──
    if getattr(args, "fill_raw_body", False):
        if not SUPABASE_KEY:
            sys.exit("Укажите SUPABASE_KEY в .env или переменных окружения")
        from supabase import create_client
        sb = create_client(SUPABASE_URL, SUPABASE_KEY)
        session_id, cookies, last_seq = get_or_create_session()
        ximss = XIMSSSession(session_id, cookies, last_seq)
        ximss.open_folder()
        ximss = fill_raw_body(sb, ximss)   # может вернуть новый ximss после переподключения
        _save_session_cache(session_id, cookies, ximss.seq)
        return

    if not LOGIN or not PASSWORD:
        sys.exit("Укажите XIMSS_LOGIN и XIMSS_PASS в .env или переменных окружения")

    sb = None
    if not args.dry_run:
        if not SUPABASE_KEY:
            sys.exit("Укажите SUPABASE_KEY в .env или переменных окружения")
        from supabase import create_client
        sb = create_client(SUPABASE_URL, SUPABASE_KEY)

        # ── --truncate: очищаем таблицу перед полным перегоном ──
        if getattr(args, "truncate", False):
            log.info("─── TRUNCATE: удаляем все записи vessel_dpr ───")
            try:
                sb.table("vessel_dpr").delete().neq("id", 0).execute()
                log.info("  ✓ Таблица vessel_dpr очищена")
            except Exception as e:
                log.error(f"  ✗ Ошибка очистки: {e}")
                sys.exit(1)

    # ── Режим --daemon ──
    if args.daemon:
        if not sb:
            sys.exit("--daemon требует SUPABASE_KEY")
        run_daemon(sb, args)
        return

    run_collection(sb, args)


def run_collection(sb, args):
    """Одна итерация сбора почты из XIMSS → vessel_dpr."""
    import datetime as _dt

    # При SSL EOF сразу после логина — повторяем сессию (до 3 раз)
    for attempt in range(3):
        session_id, cookies, last_seq = get_or_create_session()
        ximss = XIMSSSession(session_id, cookies, last_seq)
        try:
            ximss.open_folder()
            break  # успешно открыли папку
        except Exception as e:
            err = str(e).lower()
            if attempt < 2 and any(k in err for k in ("ssl", "eof", "connection", "max retries")):
                log.warning(f"open_folder попытка {attempt+1} не удалась ({e}), повтор через 15 сек...")
                time.sleep(15)
                # Сбрасываем кеш сессии чтобы получить свежую
                _save_session_cache("", {}, 0)
                continue
            raise

    # ── Перечень активных судов (за последние 90 дней) ──
    active_vessel_count = 0
    if sb and not args.dry_run:
        try:
            res = sb.table("vessel_dpr") \
                .select("vessel_name", count="exact") \
                .gte("report_date", (date.today() - _dt.timedelta(days=90)).isoformat()) \
                .execute()
            names = set(r["vessel_name"] for r in (res.data or []))
            active_vessel_count = len(names)
            log.info(f"Активных судов (≤90 дней): {active_vessel_count}")
        except Exception as e:
            log.warning(f"Ошибка запроса активных судов: {e}")

    if args.uids:
        uids = [int(u.strip()) for u in args.uids.split(",") if u.strip()]
        log.info(f"Режим --uids: обрабатываем {uids}")
    else:
        uids = ximss.get_today_uids(limit=args.limit, all_uids=getattr(args, "all_uids", False))
    if not uids:
        log.info("Новых писем нет")
        return

    ok = fail = skip = 0
    webmail_uids: list[int] = []
    for uid in uids:
        log.info(f"─── UID {uid} ───")
        try:
            subject, sender, date_str, body = ximss.read_message(uid)
            email_date = _parse_email_date(date_str)
            log.info(f"  От:   {sender}")
            log.info(f"  Тема: {subject!r}")
            log.info(f"  Дата письма: {date_str!r} → {email_date}")

            body_fields = extract_fields(body, "") if body.strip() else {}
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

            if not raw_msg and not body_fields:
                emb_body = ximss.read_embedded_eml_text(uid)
                if emb_body:
                    body = emb_body

            record = parse_to_vessel_dpr(subject, sender, body, uid, raw_msg,
                                         email_date=email_date)
            if record is None:
                skip += 1
                if not args.dry_run:
                    ximss.mark_seen(uid)
                continue

            if record.get("parse_ok") is False and not args.dry_run:
                webmail_uids.append(uid)

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
            if any(kw in err_str.lower() for kw in (
                "sequence error", "ssl", "eof", "connection", "timed out", "max retries"
            )) or "400 client error" in err_str.lower():
                log.info("  Переподключение к XIMSS...")
                try:
                    session_id, cookies, last_seq = get_session()
                    _save_session_cache(session_id, cookies, last_seq)
                    ximss = XIMSSSession(session_id, cookies, last_seq)
                    ximss.open_folder()
                    log.info("  Переподключение успешно — продолжаем")
                except Exception as reauth_e:
                    log.error(f"  Переподключение не удалось: {reauth_e}")
                    break
            fail += 1

    print(f"\n{'[DRY RUN] ' if args.dry_run else ''}Итог: {ok} записано, {skip} пропущено, {fail} ошибок")

    # ── Webmail fallback ──
    if webmail_uids and sb and not args.dry_run:
        log.info(f"\n─── Webmail fallback для {len(webmail_uids)} писем ───")
        session_id2, cookies2, last_seq2, driver = get_session(keep_driver=True)
        download_dir = os.path.join(os.getcwd(), "downloads")
        os.makedirs(download_dir, exist_ok=True)

        for uid in webmail_uids:
            log.info(f"  UID {uid}: пробуем скачать вложение...")
            filepath = _download_attachment_via_webmail(driver, uid, download_dir)
            if filepath is None:
                log.warning(f"  UID {uid}: не удалось скачать")
                continue
            try:
                with open(filepath, "rb") as fh:
                    file_data = fh.read()
                fname_lower = os.path.basename(filepath).lower()
                att_text = ""
                is_form = False
                if fname_lower.endswith(".docx"):
                    from dpr_parser import _read_docx_from_bytes
                    att_text = _read_docx_from_bytes(file_data)
                elif fname_lower.endswith(".doc"):
                    from dpr_parser import read_doc_attachment
                    att_text, is_form = read_doc_attachment(file_data)
                elif fname_lower.endswith(".eml"):
                    from dpr_parser import _read_eml_from_bytes
                    att_text = _read_eml_from_bytes(file_data)
                    log.info(f"  UID {uid}: .eml вложение → RFC-822 текст {len(att_text)} символов")
                else:
                    from dpr_parser import _read_text_attachment
                    att_text = _read_text_attachment(file_data)

                if not att_text.strip():
                    log.warning(f"  UID {uid}: не удалось извлечь текст из {os.path.basename(filepath)}")
                    continue

                log.info(f"  UID {uid}: извлечено {len(att_text)} символов из {os.path.basename(filepath)}")
                subject, sender, date_str2, _body = ximss.read_message(uid)
                email_date2 = _parse_email_date(date_str2)
                record2 = parse_to_vessel_dpr(subject, sender, att_text, uid, raw_msg=None,
                                              is_doc_form=is_form, email_date=email_date2)
                if record2 and record2.get("parse_ok"):
                    if upsert_vessel_dpr(sb, record2):
                        log.info(f"  UID {uid}: ✓ обновлён через webmail")
                        ok += 1
                    else:
                        log.warning(f"  UID {uid}: не удалось обновить в БД")
                else:
                    log.warning(f"  UID {uid}: после webmail parse_ok всё ещё False")
            except Exception as e:
                log.error(f"  UID {uid}: ошибка обработки файла: {e}")
            finally:
                try:
                    os.remove(filepath)
                except Exception:
                    pass

        driver.quit()
        log.info("Webmail fallback завершён")

    # ── Кеш сессии ──
    if not args.dry_run:
        _save_session_cache(session_id, cookies, ximss.seq)

    # ── Условие остановки ──
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
                log.info(f"Все {active_vessel_count} судов отчитались.")
        except Exception as e:
            log.warning(f"Ошибка проверки условия остановки: {e}")


def run_daemon(sb, args):
    """Вечный цикл: раз в минуту проверяем dpr_settings.run_requested."""
    log.info("Daemon mode запущен. Опрос Supabase каждые 60 сек.")
    import argparse as _ap
    # Аргументы для run_collection в daemon-режиме (без dry-run / uids)
    coll_args = _ap.Namespace(
        dry_run=False, limit=0, uids="", all_uids=False,
        verbose=args.verbose, truncate=False, daemon=False,
    )
    while True:
        try:
            row = sb.table("dpr_settings").select("run_requested").eq("id", 1).maybe_single().execute()
            if row.data and row.data.get("run_requested"):
                # Сбрасываем флаг и ставим статус "running"
                sb.table("dpr_settings").update({
                    "run_requested": False,
                    "status": "running",
                }).eq("id", 1).execute()
                log.info("Флаг run_requested=True — запускаю сбор почты")
                try:
                    run_collection(sb, coll_args)
                    sb.table("dpr_settings").update({
                        "status": "done",
                        "last_run_at": datetime.now(timezone.utc).isoformat(),
                        "last_run_msg": "OK",
                    }).eq("id", 1).execute()
                    log.info("Сбор завершён — статус: done")
                except Exception as e:
                    log.error(f"Ошибка сбора: {e}")
                    sb.table("dpr_settings").update({
                        "status": "error",
                        "last_run_at": datetime.now(timezone.utc).isoformat(),
                        "last_run_msg": str(e)[:300],
                    }).eq("id", 1).execute()
        except Exception as e:
            log.warning(f"Ошибка опроса Supabase: {e}")
        time.sleep(60)


if __name__ == "__main__":
    main()
