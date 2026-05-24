"""
dpr_parser.py — Парсер ежедневных диспетчерских донесений (ДПР)
ФГБУ «Морспасслужба» → Supabase dpr_entries

Проверен на реальных письмах 07.05.2026:
  • БСС Тепсей, Водолаз Денисов, Артемис Оффшор, Отто Шмидт,
    Виктор Буйницкий, Балтика, Финвал, Спасатель Демидов,
    Спасатель Заборщиков (вложение .doc OLE2)

Установка зависимостей:
    pip install extract-msg supabase olefile

Использование:
    python dpr_parser.py report.msg [--dry-run] [--verbose]
    python dpr_parser.py /path/to/msgs/ [--dry-run]

Переменные окружения:
    SUPABASE_KEY=eyJ...   — сервисный ключ Supabase (не нужен при --dry-run)
"""

from __future__ import annotations

import argparse
import io
import json
import logging
import os
import re
import sys
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Optional

# ── Зависимости ──────────────────────────────────────────────────────────────

try:
    import extract_msg
except ImportError:
    sys.exit("Установите: pip install extract-msg")

try:
    from supabase import create_client, Client
except ImportError:
    sys.exit("Установите: pip install supabase")

try:
    import olefile
    HAS_OLEFILE = True
except ImportError:
    HAS_OLEFILE = False

try:
    from docx import Document as DocxDocument
    HAS_DOCX = True
except ImportError:
    HAS_DOCX = False

# ── Конфигурация ─────────────────────────────────────────────────────────────

SUPABASE_URL = "https://otjiwxvszomwpqmwusqd.supabase.co"
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger(__name__)


# ════════════════════════════════════════════════════════════════════════════
#  КОНСТАНТЫ
# ════════════════════════════════════════════════════════════════════════════

# Ключевые слова для типа ДПР
_TYPE_KW: list[tuple[str, re.Pattern]] = [
    ("МОРЕ",           re.compile(r"\bморе\b|at[\s_-]*sea\b|ДПР[_\s-]*МОРЕ|sea[\s_/-]rpt", re.I)),
    ("ПОРТ",           re.compile(r"\bпорт\b|in[\s_-]*port\b|ДПР[_\s-]*ПОРТ|port[\s_/-]rpt", re.I)),
    ("ОТХОД",          re.compile(r"\bотход\b|departure\b|\bdep\b", re.I)),
    ("ПРИХОД",         re.compile(r"\bприход\b|arrival\b|\barr\b", re.I)),
    ("НЕПРЕДВИДЕННЫЕ", re.compile(r"непредвид|unforeseen|incident|аварий", re.I)),
]

# Начало подписи — здесь обрезаем тело
_SIGNATURE_RE = re.compile(
    r"^(с\s+уважени|best\s+regards|км\s+[а-яё]|капитан\s+[а-яё]|master\b|\bkm\s+\w"
    r"|тел[.:\s]|моб[.:\s]|mobile[.:\s]|vsat[.:\s]|inm[- ]c:|mmsi:|e[-\s]?mail:)",
    re.I | re.MULTILINE,
)

# Координатный паттерн (поддерживаем все реальные форматы)
# "52-28,1 N/ 143-38,6 Е"  "45°04N/036°32E"  "55-31,6N 020-08,7E"
_COORD_RE = re.compile(
    r"""
    (?P<lat_d>\d{1,3})[-°\s]
    (?P<lat_m>\d{1,2}(?:[,.]\d+)?)['°]?\s*
    (?P<lat_h>[NS\u043d\u0441Nn])[/\s,]+
    (?P<lon_d>\d{2,3})[-°\s]
    (?P<lon_m>\d{1,2}(?:[,.]\d+)?)['°]?\s*
    (?P<lon_h>[EW\u0435w\u0415W])
    """,
    re.VERBOSE | re.IGNORECASE,
)

# Форматы дат
_DATE_FMTS = ("%d.%m.%Y", "%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d.%m.%y", "%d/%m/%y")

# Детектор филиала
_BRANCH_MAP: list[tuple[str, re.Pattern]] = [
    ("СВРФ", re.compile(r"северн|севф|svrp|мурман|архан", re.I)),
    ("БЛТФ", re.compile(r"\bбф\b|балт(?!ик)|balt|калинин|питер|ленингр", re.I)),
    ("ПРМФ", re.compile(r"примф|влад[ив]|примор", re.I)),
    ("СХЛФ", re.compile(r"сахф|сахал|sakhal|корсаков|южно.сах", re.I)),
    ("КФ",   re.compile(r"\bкф\b|каспий|casp|астрахан|od\.kas", re.I)),
    ("ЧМФ",  re.compile(r"черном|новоросс|севасто|novoross", re.I)),
    ("ДВНФ", re.compile(r"дальн|двн|камчат|петропавл", re.I)),
]

# Номер поля в начале строки — НЕ захватываем «метку» типа "Судно:",
# чтобы не съесть начало значения (например "52-" в координатах)
_FIELD_LINE_RE = re.compile(r"^\s*(?:п\.?\s*)?(\d{1,2})[.)]\s*", re.MULTILINE)


# ════════════════════════════════════════════════════════════════════════════
#  ОПРЕДЕЛЕНИЕ ТИПА ДПР
# ════════════════════════════════════════════════════════════════════════════

def detect_report_type(subject: str, body_head: str) -> str:
    for rtype, pat in _TYPE_KW:
        if pat.search(subject):
            return rtype
    for rtype, pat in _TYPE_KW:
        if pat.search(body_head):
            return rtype
    return "МОРЕ"


# ════════════════════════════════════════════════════════════════════════════
#  ПАРСИНГ ПРОНУМЕРОВАННЫХ ПОЛЕЙ
# ════════════════════════════════════════════════════════════════════════════

def _strip_signature(text: str) -> str:
    m = _SIGNATURE_RE.search(text)
    return text[:m.start()] if m else text

def _clean_value(v: str) -> str:
    """Нормализует значение поля: убирает хвостовые табы, двойные пробелы."""
    v = re.sub(r"[\t ]+$", "", v, flags=re.MULTILINE)   # хвостовые пробелы/табы
    v = re.sub(r"\n{2,}", "\n", v)                       # кратные переносы → один
    return v.strip()

def extract_fields(body: str) -> dict[str, str]:
    """
    Универсальный парсер пронумерованных полей ДПР.

    Формат A (большинство) — поля через двойной перенос:
        1. БСС «Тепсей»\\r\\n\\r\\n2. АСГ\\r\\n\\r\\n...

    Формат B (Водолаз, Артемис) — поля через одиночный перенос + таб:
        1. Водолаз Денисов\\t \\r\\n2. Межбазовый переход\\t \\r\\n...
    """
    text = _strip_signature(body).replace("\r\n", "\n").replace("\r", "\n")

    # Обрезаем до первого нумерованного поля
    first = _FIELD_LINE_RE.search(text)
    if first:
        text = text[first.start():]

    # Разбиваем по шаблону начала поля
    # split() возвращает: [pre, num1, val1, num2, val2, ...]
    chunks = _FIELD_LINE_RE.split(text)

    result: dict[str, str] = {}
    i = 1
    while i + 1 < len(chunks):
        num = chunks[i].strip()
        val = _clean_value(chunks[i + 1]) if i + 1 < len(chunks) else ""
        if num and num not in result:
            result[num] = val
        i += 2

    return result


def extract_fields_doc_form(text: str) -> dict[str, str]:
    """
    Парсер для формата таблицы Word .doc: каждая строка объединяет
    метку и значение одного поля (из двух колонок таблицы):
        "1.Название судна1.  Спасатель Заборщиков"
        "5. Запасы-расход...             5. ДТ 100.9 – 0.4 / ТТ – 0..."

    Стратегия: берём ПОСЛЕДНЕЕ вхождение "N. " в строке —
    это всегда начало колонки со значением.
    """
    result: dict[str, str] = {}
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        # Все вхождения "N. " где после идёт заглавная буква (рус/лат) или цифра
        matches = list(re.finditer(r"(\d{1,2})\.\s+(?=[А-ЯA-Z\dА-я])", line))
        if not matches:
            continue
        # Последнее вхождение — колонка значения
        last = matches[-1]
        num = last.group(1)
        val = re.sub(r"\s+", " ", line[last.end():]).strip()
        # Убираем '\r' и лишние пробелы внутри значения
        val = re.sub(r"[\r\n]+\s*", " ", val).strip()
        if num not in result and val:
            result[num] = val
    return result


# ════════════════════════════════════════════════════════════════════════════
#  ВЛОЖЕНИЯ: .docx и .doc (OLE2)
# ════════════════════════════════════════════════════════════════════════════

def read_docx_attachment(data: bytes) -> str:
    if not HAS_DOCX:
        log.warning("python-docx не установлен — .docx пропущен")
        return ""
    try:
        doc = DocxDocument(io.BytesIO(data))
        parts = [p.text for p in doc.paragraphs if p.text.strip()]
        for tbl in doc.tables:
            for row in tbl.rows:
                cells = [c.text.strip() for c in row.cells if c.text.strip()]
                if cells:
                    parts.append("  ".join(cells))
        return "\n".join(parts)
    except Exception as e:
        log.warning(f"docx ошибка: {e}")
        return ""

def read_doc_attachment(data: bytes) -> tuple[str, bool]:
    """
    Читает бинарный .doc (OLE2).
    Возвращает (текст, is_form_format).
    is_form_format=True если это шаблон с двойной нумерацией (ФОРМА ДПР).
    """
    if data[:4] != b'\xd0\xcf\x11\xe0':
        # Не OLE2 — может быть .docx
        return read_docx_attachment(data), False

    if not HAS_OLEFILE:
        log.warning("olefile не установлен — .doc пропущен")
        return "", False

    try:
        # Извлекаем UTF-16LE строки из всего файла
        text_utf16 = data.decode("utf-16-le", errors="replace")
        segments = re.split(r"[\x00-\x08\x0b\x0c\x0e-\x1f]{2,}", text_utf16)
        lines = []
        for seg in segments:
            clean = re.sub(r"[^\x20-\x7e\u0400-\u04ff\s/.,:()\-\u2013\u2014\u2116]", "", seg).strip()
            if len(clean) > 3 and re.search(r"[А-Яа-яёЁ]{2,}", clean):
                lines.append(clean)

        text = "\n".join(lines)
        # Признак шаблона: содержит "ФОРМА" или двойную нумерацию "1.Название"
        is_form = bool(re.search(r"ФОРМА\s+ДПР|1\.\s*Название\s+судна", text, re.I))
        return text, is_form
    except Exception as e:
        log.warning(f"doc OLE2 ошибка: {e}")
        return "", False

def extract_attachment_body(msg) -> tuple[str, bool]:
    """
    Ищет первое .doc/.docx вложение.
    Возвращает (текст, is_doc_form).
    """
    for att in (msg.attachments or []):
        fname = (getattr(att, "longFilename", "")
                 or getattr(att, "shortFilename", "")
                 or "").lower()
        if fname.endswith(".docx"):
            text = read_docx_attachment(att.data)
            if text.strip():
                log.info(f"Вложение .docx: {fname}")
                return text, False
        elif fname.endswith(".doc"):
            text, is_form = read_doc_attachment(att.data)
            if text.strip():
                log.info(f"Вложение .doc{'(форма)' if is_form else ''}: {fname}")
                return text, is_form
    return "", False


# ════════════════════════════════════════════════════════════════════════════
#  КООРДИНАТЫ
# ════════════════════════════════════════════════════════════════════════════

def parse_coords(s: str) -> tuple[Optional[float], Optional[float]]:
    """(lat, lon) в decimal degrees или (None, None)."""
    m = _COORD_RE.search(s)
    if not m:
        return None, None
    try:
        lat = float(m.group("lat_d")) + float(m.group("lat_m").replace(",", ".")) / 60
        lon = float(m.group("lon_d")) + float(m.group("lon_m").replace(",", ".")) / 60
        if m.group("lat_h").upper() in ("S", "Ю"):
            lat = -lat
        if m.group("lon_h").upper() in ("W", "З"):
            lon = -lon
        if -90 <= lat <= 90 and -180 <= lon <= 180:
            return round(lat, 5), round(lon, 5)
    except (TypeError, ValueError):
        pass
    return None, None

def normalize_coord_raw(s: str) -> str:
    """Нормализует координатную часть к виду "52-28,1 N 143-38,6 Е"."""
    m = _COORD_RE.search(s)
    if not m:
        return s.strip()
    lat_m = m.group("lat_m").replace(".", ",")
    lon_m = m.group("lon_m").replace(".", ",")
    lat_h = (m.group("lat_h") or "N").upper()
    lon_h = (m.group("lon_h") or "E").upper()
    norm = f"{m.group('lat_d')}-{lat_m} {lat_h} {m.group('lon_d')}-{lon_m} {lon_h}"
    return (s[:m.start()] + norm + s[m.end():]).strip()


# ════════════════════════════════════════════════════════════════════════════
#  ДАТА
# ════════════════════════════════════════════════════════════════════════════

def parse_date_from_field3(f3: str) -> Optional[date]:
    """
    Извлекает дату из п.3:
        "07.05.2026 / 08:00 МСК"
        "07/05/2026/08:00 МСК"
        "07.05.2026 0800 МСК"
    """
    date_part = re.split(r"\s*/\s*|\s+(?=\d{2}[:.]\d{2})", f3.strip())[0]
    date_part = re.sub(r"\s+", ".", date_part.strip())
    for fmt in _DATE_FMTS:
        try:
            return datetime.strptime(date_part, fmt).date()
        except ValueError:
            pass
    m = re.search(r"(\d{1,2})[./](\d{1,2})[./](\d{2,4})", f3)
    if m:
        d, mo, yr = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if yr < 100:
            yr += 2000
        try:
            return date(yr, mo, d)
        except ValueError:
            pass
    # Compact DDMMYY без разделителей: "100126 0800" → 10.01.2026
    m6 = re.match(r"^(\d{2})(\d{2})(\d{2})(?:\s|$)", f3.strip())
    if m6:
        d, mo, yr = int(m6.group(1)), int(m6.group(2)), int(m6.group(3)) + 2000
        try:
            return date(yr, mo, d)
        except ValueError:
            pass
    return None


# ════════════════════════════════════════════════════════════════════════════
#  НАЗВАНИЕ СУДНА
# ════════════════════════════════════════════════════════════════════════════

_VESSEL_PREFIX_RE = re.compile(
    r"^(?:мтс|мфасс|масс|бсс|асс|нис|ссн|м/?с|т/?х|т/?к|буксир|пс|плавкран)\s+",
    re.I,
)

def normalize_vessel_name(raw: str) -> str:
    s = _VESSEL_PREFIX_RE.sub("", raw.strip())
    s = re.sub(r"[«»\u201c\u201d\u2018\u2019]", "", s)  # кавычки
    return re.sub(r"\s{2,}", " ", s).strip().lower()

def extract_vessel_name(fields: dict[str, str], sender: str, subject: str) -> str:
    # П.1 — главный источник
    f1 = re.sub(r"[«»\u201c\u201d]", "", fields.get("1", "")).strip()
    if f1 and len(f1) > 2:
        return normalize_vessel_name(f1)
    # sh.vessel_name@morspas.ru
    em = re.search(r"sh\.([^@]+)@morspas\.ru", sender, re.I)
    if em:
        return normalize_vessel_name(em.group(1).replace(".", " ").replace("_", " "))
    # Тема
    subj = re.sub(
        r"\b(дпр|море|порт|отход|приход|sea|port|dep|arr)\b"
        r"|\d{2}[./]\d{2}[./]\d{4}|\d{4}[\s_]?МСК",
        "", subject, flags=re.I,
    ).strip(" /-:_")
    subj = re.sub(r"\s{2,}", " ", subj).strip()
    if subj and len(subj) > 2:
        return normalize_vessel_name(subj)
    return ""


# ════════════════════════════════════════════════════════════════════════════
#  ФИЛИАЛ
# ════════════════════════════════════════════════════════════════════════════

def detect_branch(vessel: str, sender: str, body_head: str) -> str:
    """
    Определяет филиал. Приоритет: содержимое тела письма (п.2-п.4 часто
    указывает район работ) → название судна + адрес отправителя.
    Это позволяет правильно определить СХЛФ для «Балтики», работающей
    по контракту с Сахалинморнефтегаз, несмотря на «Балт» в имени судна.
    """
    # Сначала ищем по телу письма (наиболее достоверно)
    for branch, pat in _BRANCH_MAP:
        if pat.search(body_head):
            return branch
    # Fallback: имя судна + адрес
    ident = f"{vessel} {sender}"
    for branch, pat in _BRANCH_MAP:
        if pat.search(ident):
            return branch
    return ""


# ════════════════════════════════════════════════════════════════════════════
#  СБОРКА ПОЛЕЙ ДЛЯ БД
# ════════════════════════════════════════════════════════════════════════════

def build_coord_raw(fields: dict[str, str], rtype: str) -> str:
    """
    Формирует coord_raw для БД в формате "<позиция> [БЭП|СЭП]".
    locationNormalizer.ts срезает БЭП/СЭП в конце при отображении.
    """
    if rtype == "МОРЕ":
        f4 = fields.get("4", "").strip()
        return normalize_coord_raw(f4) if f4 else ""

    elif rtype in ("ПОРТ", "ОТХОД", "ПРИХОД"):
        f4 = (fields.get("4") or fields.get("3") or "").strip()
        # ОТХОД/ПРИХОД: п.3 = "порт / время" — берём только порт
        if rtype in ("ОТХОД", "ПРИХОД"):
            f4 = re.split(r"\s*/\s*\d{2}[:.]?\d{2}", f4)[0].strip()
        if not f4:
            return ""
        # Добавляем тип электропитания из п.7
        f7 = fields.get("7", "").strip().upper()
        if "СЭП" in f7:
            return f"{f4} СЭП"
        elif "БЭП" in f7:
            return f"{f4} БЭП"
        return f4

    return fields.get("4", "").strip()

def build_supplies(fields: dict[str, str]) -> str:
    """П.5 — топливо/масло/вода (хранится как есть)."""
    v = fields.get("5", "").strip()
    # Инмарсат переносит длинные строки — склеиваем обратно
    v = re.sub(r"\s*\n\s*", "", v)
    return v

def build_note(fields: dict[str, str], rtype: str) -> str:
    """Собирает примечания из полей, специфичных для типа ДПР."""
    candidates = {
        "МОРЕ":           ["11", "12", "13"],
        "ПОРТ":           ["8", "9", "11"],
        "ОТХОД":          ["6", "7", "8"],
        "ПРИХОД":         ["6", "7", "8"],
        "НЕПРЕДВИДЕННЫЕ": ["8", "9", "10", "11", "12"],
    }.get(rtype, ["8", "9", "10", "11"])

    parts = []
    for n in candidates:
        v = fields.get(n, "").strip()
        if v and not re.match(r"^(нет\s*(информации)?|[-\u2014\u2013]|0)$", v, re.I):
            parts.append(v)
    return " | ".join(parts)


# ════════════════════════════════════════════════════════════════════════════
#  ОСНОВНАЯ ФУНКЦИЯ ПАРСИНГА
# ════════════════════════════════════════════════════════════════════════════

def parse_msg_file(path: str) -> Optional[dict]:
    try:
        msg = extract_msg.openMsg(path)
    except Exception as e:
        log.error(f"Не открывается {Path(path).name}: {e}")
        return None

    subject: str = (msg.subject or "").strip()
    sender:  str = (msg.sender or "").strip()
    body:    str = (msg.body or "").strip()

    log.info("─" * 60)
    log.info(f"Файл:    {Path(path).name}")
    log.info(f"От:      {sender}")
    log.info(f"Тема:    {subject!r}")

    # ── Вложения ────────────────────────────────────────────────────────────
    is_doc_form = False
    att_text, is_doc_form = extract_attachment_body(msg)
    if att_text.strip() and ("В приложении" in body or len(body.strip()) < 80):
        body = att_text

    if not body.strip():
        log.warning("Тело письма пустое — пропускаем")
        return None

    # ── Тип ДПР ─────────────────────────────────────────────────────────────
    rtype = detect_report_type(subject, body[:300])
    log.info(f"Тип:     {rtype}")

    # ── Поля ────────────────────────────────────────────────────────────────
    fields = extract_fields_doc_form(body) if is_doc_form else extract_fields(body)
    log.debug(f"Поля:    {json.dumps(fields, ensure_ascii=False)}")

    if not fields:
        log.warning("Пронумерованные поля не найдены")
        return None

    # ── Название судна ───────────────────────────────────────────────────────
    vessel_name = extract_vessel_name(fields, sender, subject)
    if not vessel_name:
        log.warning("Название судна не определено — пропускаем")
        return None

    # ── Дата ─────────────────────────────────────────────────────────────────
    report_date = parse_date_from_field3(fields.get("3", ""))
    if not report_date:
        try:
            report_date = msg.date.date() if msg.date else date.today()
        except Exception:
            report_date = date.today()

    log.info(f"Судно:   {vessel_name!r}  |  Дата: {report_date}")

    # ── Координаты ───────────────────────────────────────────────────────────
    coord_raw = build_coord_raw(fields, rtype)
    lat, lng = parse_coords(fields.get("4", ""))
    if lat and lng:
        log.info(f"Координаты: {lat}, {lng}")
    elif coord_raw:
        log.info(f"Местоположение: {coord_raw!r}")

    # ── Прочие поля ──────────────────────────────────────────────────────────
    # Используем весь текст письма для определения филиала (включая п.2)
    branch   = detect_branch(vessel_name, sender, body[:500])
    supplies = build_supplies(fields)
    note     = build_note(fields, rtype)

    # п.2 = статус работ (АСГ/Ремонт/АСД/...) → потенциальный contract_info
    contract_from_dpr = fields.get("2", "").strip() or None

    record = {
        "vessel_name":             vessel_name,
        "branch":                  branch,
        "report_date":             report_date.isoformat(),
        "status":                  rtype,
        "coord_raw":               coord_raw or None,
        "lat":                     lat,
        "lng":                     lng,
        "note":                    note or None,
        "supplies":                supplies or None,
        "uploaded_at":             datetime.now(timezone.utc).isoformat(),
        "_contract_info_from_dpr": contract_from_dpr,
    }
    return record


# ════════════════════════════════════════════════════════════════════════════
#  UPSERT В SUPABASE
# ════════════════════════════════════════════════════════════════════════════

def upsert_record(sb: "Client", record: dict) -> bool:
    """
    Upsert в dpr_entries с сохранением ручных полей contract_info/work_period.
    Приоритет: существующая запись в БД → предыдущая дата → п.2 из ДПР.
    """
    vessel = record["vessel_name"]
    dt     = record["report_date"]
    contract_from_dpr = record.pop("_contract_info_from_dpr", None)

    # Существующая запись за ту же дату
    try:
        res = (
            sb.table("dpr_entries")
            .select("contract_info,work_period")
            .eq("vessel_name", vessel)
            .eq("report_date", dt)
            .limit(1)
            .execute()
        )
        existing = res.data[0] if res.data else None
    except Exception as e:
        log.warning(f"Ошибка чтения существующей записи: {e}")
        existing = None

    if existing:
        if existing.get("contract_info"):
            record["contract_info"] = existing["contract_info"]
        if existing.get("work_period"):
            record["work_period"] = existing["work_period"]
    else:
        # Последняя предыдущая дата
        try:
            prior = (
                sb.table("dpr_entries")
                .select("contract_info,work_period")
                .eq("vessel_name", vessel)
                .lt("report_date", dt)
                .order("report_date", desc=True)
                .limit(1)
                .execute()
            )
            prior_row = prior.data[0] if prior.data else None
        except Exception as e:
            log.warning(f"Ошибка чтения предыдущей записи: {e}")
            prior_row = None

        if prior_row and prior_row.get("contract_info"):
            record["contract_info"] = prior_row["contract_info"]
        elif contract_from_dpr:
            record["contract_info"] = contract_from_dpr

        if prior_row and prior_row.get("work_period"):
            record["work_period"] = prior_row["work_period"]

    try:
        sb.table("dpr_entries").upsert(
            record,
            on_conflict="vessel_name,report_date",
        ).execute()
        log.info(f"✓  {vessel} / {dt} / {record['status']}")
        return True
    except Exception as e:
        log.error(f"✗  upsert ошибка: {e}")
        return False


# ════════════════════════════════════════════════════════════════════════════
#  ТОЧКА ВХОДА
# ════════════════════════════════════════════════════════════════════════════

def main() -> None:
    ap = argparse.ArgumentParser(
        description="Парсер ДПР .msg → Supabase dpr_entries",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Примеры:
  python dpr_parser.py report.msg --dry-run
  python dpr_parser.py report.msg --dry-run --verbose
  SUPABASE_KEY=eyJ... python dpr_parser.py /path/to/msgs/
        """,
    )
    ap.add_argument("path",      help="Файл .msg или директория")
    ap.add_argument("--dry-run", action="store_true", help="Вывод JSON, без записи в БД")
    ap.add_argument("--verbose", action="store_true", help="Подробный лог")
    args = ap.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    p = Path(args.path)
    files = sorted(p.glob("*.msg")) if p.is_dir() else ([p] if p.is_file() else [])

    if not files:
        sys.exit(f"Файлы .msg не найдены: {args.path}")

    sb: Optional["Client"] = None
    if not args.dry_run:
        if not SUPABASE_KEY:
            sys.exit("Установите переменную окружения SUPABASE_KEY")
        sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    ok = fail = 0
    for f in files:
        record = parse_msg_file(str(f))
        if record is None:
            fail += 1
            continue
        if args.dry_run:
            out = {k: v for k, v in record.items() if not k.startswith("_")}
            print(json.dumps(out, ensure_ascii=False, indent=2, default=str))
            ok += 1
        else:
            if upsert_record(sb, record):
                ok += 1
            else:
                fail += 1

    print(f"\n{'[DRY RUN] ' if args.dry_run else ''}Итог: {ok} ок, {fail} ошибок")


if __name__ == "__main__":
    main()
