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
import email as _email_lib
import io
import json
import logging
import os
import re
import struct
import sys
import zipfile
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

# Шаблоны для обрезки подписи внутри ЗНАЧЕНИЯ поля
_SIGNATURE_VALUE_STOP_PATTERNS: list[re.Pattern] = [
    re.compile(r'с\s+уважением', re.IGNORECASE),
    re.compile(r'best\s+regards', re.IGNORECASE),
    re.compile(r'brgds', re.IGNORECASE),
    re.compile(r'с\s+уваж\.?', re.IGNORECASE),
    re.compile(r'imo\s*(?:no\.?|№)', re.IGNORECASE),
    re.compile(r'inmarsat\s*c\s*:', re.IGNORECASE),
    re.compile(r'inm-c\s*:', re.IGNORECASE),
    re.compile(r'mmsi\s*[:\d]', re.IGNORECASE),
    re.compile(r'mobile\s*\(master\)', re.IGNORECASE),
    re.compile(r'e-mail\s*:', re.IGNORECASE),
    re.compile(r'web\s*:\s*morspas', re.IGNORECASE),
    re.compile(r'тел\.\s*\(mob\)', re.IGNORECASE),
    re.compile(r'\+7\s*[\(\d]', re.IGNORECASE),
    re.compile(r'морская\s+спасательная\s+служба', re.IGNORECASE),
    re.compile(r'marine\s+rescue\s+service', re.IGNORECASE),
]

# Координатный паттерн (поддерживаем все реальные форматы)
# "52-28,1 N/ 143-38,6 Е"  "45°04N/036°32E"  "55-31,6N 020-08,7E"
_COORD_RE = re.compile(
    r"""
    (?P<lat_d>\d{1,3})[-°ºᵒ\s]
    (?P<lat_m>\d{1,2}(?:[,.]\d+)?)['’ʼ°]?\s*
    (?P<lat_h>[NS\u043d\u0441Nn])[/\s,]+
    (?P<lon_d>\d{2,3})[-°ºᵒ\s]
    (?P<lon_m>\d{1,2}(?:[,.]\d+)?)['’ʼ°]?\s*
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
    ("КСПФ", re.compile(r"\bкф\b|каспий|casp|астрахан|od\.kas", re.I)),
    ("АЧФ",  re.compile(r"черном|новоросс|севасто|novoross", re.I)),
    ("КМЧФ", re.compile(r"дальн|двн|камчат|петропавл", re.I)),
]

# Номер поля в начале строки — НЕ захватываем «метку» типа "Судно:",
# чтобы не съесть начало значения (например "52-" в координатах).
# Формат A: "1. Текст" или "1) Текст"
# Формат B: "1  Текст" (Каспийский филиал — два пробела вместо точки)
# Формат C: "1.Название" (без пробела — DOC-шаблоны)
# Формат D: "П.1Текст"  (Беклемишев — номер сразу за значением, без разделителя)
# Много-веточный regex для захвата номеров полей.
# При split() с несколькими группами возвращает None для несматченных групп —
# обработчик в extract_fields() пропускает None.
_FIELD_LINE_RE = re.compile(
    r"^\s*[Пп]\.?\s*(\d{1,2})(?=\S)"            # 1: П.N → любой не-пробел после
    r"|"
    r"^\s*(\d{1,2})[.)](?!\d)\s*"                # 2: N. или N) — НЕ дата
    r"|"
    r"^\s*(\d{1,2})\s{2,}"                       # 3: N + два пробела (Каспий)
    r"|"
    r"^\s*(\d{1,2})(?=[А-ЯЁа-яёA-Za-z])"         # 4: N сразу + буква
    r"|"
    r"^\s*(\d{1,2})(?=/[А-ЯЁа-яёA-Za-z])"        # 5: "12/нет" — слеш + буква (НЕ дата 12/05)
    ,
    re.MULTILINE,
)

# Паттерны-«обманки»: даты, время, количества с точкой, причалы
# Используются для пост-фильтрации ложных номеров полей
_FALSE_FIELD_PATTERNS: list[re.Pattern] = [
    # Дата: 10.06.2026, 30.05.26, 26.05.2026г
    re.compile(r"^\d{1,2}\.\d{2}\.\d{2,4}"),
    # Время: 08.00 МСК, 0800
    re.compile(r"^\d{1,2}\.\d{2}\s*(МСК|UTC|мск)?"),
    # Количество с точкой: 13.2 т, 27.000 т, 1.80 т
    re.compile(r"^\d{1,2}\.\d+\s*(т|кг|л|м)\b"),
    # Причал в конце строки: 44.
    re.compile(r"^\d{1,2}\.\s*$"),
]

# Значение поля, которое начинается с времени — вероятно ложное поле
# (осколок строки "08.00 МСК" где "08." принят за номер поля)
# Срабатывает только на КОРОТКИХ значениях (≤24 символа) —
# реальное значение поля всегда длиннее.
_FALSE_VALUE_TIME_RE = re.compile(
    r"^\s*\d{2,4}\s*(?:МСК|UTC|мск|MSK)\b"   # "00 МСК", "0800 МСК"
    r"|^\s*\d{2}[.:]\d{2}(?!\.\d)\b"           # "00.00", "08:00" — но НЕ "26.05.2026"
    r"|^\s*\d{4}\s*$"                          # "0800" (голое время)
)


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
    if m is None:
        return text
    # Если совпадение подписи стоит ДО первого пронумерованного поля —
    # это не подпись, а данные (напр. "Капитан Мартышкин" как поле 1 без номера).
    first_field = _FIELD_LINE_RE.search(text)
    if first_field and m.start() < first_field.start():
        return text
    return text[:m.start()]

def strip_signature_from_value(text: str) -> str:
    """Обрезает подпись отправителя внутри ЗНАЧЕНИЯ поля."""
    for pat in _SIGNATURE_VALUE_STOP_PATTERNS:
        m = pat.search(text)
        if m:
            text = text[:m.start()].strip(' \n\r\t/,;')
    return text

def _clean_value(v: str) -> str:
    """Нормализует значение поля: убирает хвостовые табы, двойные пробелы."""
    v = re.sub(r"[\t ]+$", "", v, flags=re.MULTILINE)   # хвостовые пробелы/табы
    v = re.sub(r"\n{2,}", "\n", v)                       # кратные переносы → один
    return v.strip()

def _is_false_field_context(text_before_num: str, num_str: str) -> bool:
    """
    Проверяет, не является ли кандидат поля ложным (дата/время/количество).
    text_before_num — текст после предыдущего поля до начала этого кандидата
    (включая возможный номер с точкой в дате).
    """
    num = int(num_str)
    for pat in _FALSE_FIELD_PATTERNS:
        if pat.search(text_before_num):
            return True
    return False

def extract_fields(body: str, dpr_type: str = "МОРЕ") -> dict[str, str]:
    """
    Универсальный парсер пронумерованных полей ДПР.

    Формат A (большинство) — поля через двойной перенос:
        1. БСС «Тепсей»\\r\\n\\r\\n2. АСГ\\r\\n\\r\\n...

    Формат B (Водолаз, Артемис) — поля через одиночный перенос + таб:
        1. Водолаз Денисов\\t \\r\\n2. Межбазовый переход\\t \\r\\n...

    Двухфазный парсинг:
      1. _FIELD_LINE_RE.split() собирает кандидатов (широкий захват)
      2. Пост-фильтр отбрасывает ложные поля:
         - номера за пределами max_field
         - кандидаты нарушающие монотонность (N→M где M ≤ N > 2)
         - большие скачки (N→M где M−N > 3) проверяются контекстом
    """
    max_field = 10 if dpr_type == "ПОРТ" else 14

    text = _strip_signature(body).replace("\r\n", "\n").replace("\r", "\n")

    # Разбиваем склеенные поля на одной строке:
    # "2) Ремонт  3) 26/05/2026 4) БП Санкт-Петербург" → каждая N) на новой строке
    # Ищем не-цифру + пробел(ы) + номер поля (1-2 цифры) + . или )
    # Разбиваем склеенные поля на одной строке:
    # Только поля 1–14 — не трогаем даты (26.05), причалы (44.), координаты
    text = re.sub(r"([^\d])\s+((?:[1-9]|1[0-4])\s*[.)](?!\d))", r"\1\n\2", text)

    # Убираем маркеры цитирования email (>>>>> в начале строк)
    text = re.sub(r"^[> \t]*>+\s*", "", text, flags=re.MULTILINE)

    # Обрезаем до первого нумерованного поля
    first = _FIELD_LINE_RE.search(text)
    if first:
        text = text[first.start():]

    # ── Сбор кандидатов полей в порядке появления ──
    # split() возвращает: [pre, num1, val1, num2, val2, ...]
    chunks = _FIELD_LINE_RE.split(text)

    # Собираем упорядоченный список (num, value) для пост-фильтрации
    # Split с 5 группами: [pre, g1..g5, val, g1..g5, val, ...]
    # Находим первый не-None среди g1..g5 — это номер поля
    N_GROUPS = 5
    ordered_candidates: list[tuple[str, str]] = []
    i = 1
    while i + N_GROUPS < len(chunks):
        # Ищем не-None номер среди N групп
        num = None
        for j in range(N_GROUPS):
            g = chunks[i + j]
            if g is not None:
                num = g.strip()
                break
        if num is None or not num.isdigit():
            i += N_GROUPS + 1
            continue
        num = str(int(num))  # "01" → "1"
        val = _clean_value(chunks[i + N_GROUPS])  # значение после N групп
        if num and val:
            ordered_candidates.append((num, val))
        i += N_GROUPS + 1

    # ── Пост-фильтрация ──
    # Двухпроходный алгоритм:
    # Проход 1: проверяем каждый кандидат на правдоподобность
    #   - номер в диапазоне 1..max_field?
    #   - монотонность: допустим рост, допустим рестарт 1..2
    #   - большой скачок (Δ>3) → проверить значение на дату/время/количество
    # Проход 2: собираем принятые поля, отброшенные склеиваем с предыдущим
    result: dict[str, str] = {}
    last_num = 0
    rejected_values: list[str] = []

    for num, val in ordered_candidates:
        if not num.isdigit():
            rejected_values.append(val)
            continue
        n = int(num)

        # Выход за max_field
        if n > max_field:
            rejected_values.append(val)
            continue

        # Рестарт нумерации (1 или 2 после больших номеров)
        if n <= 2 and last_num > 2:
            # Новая секция — разрешаем
            pass
        elif n <= last_num:
            # Монотонность нарушена — ложное поле
            rejected_values.append(val)
            continue
        elif n - last_num > 3 and last_num > 0:
            # Большой скачок: проверить, не начинается ли значение с даты/времени/количества
            stripped_val = val.strip()
            is_suspicious = False
            for pat in _FALSE_FIELD_PATTERNS:
                if pat.match(stripped_val):
                    is_suspicious = True
                    break
            if is_suspicious:
                rejected_values.append(val)
                continue

        # ── Проверка значения на время ──
        # Если короткое значение начинается с времени — вероятно ложное поле
        # (фрагмент "08.00 МСК" где "08." было принято за номер поля)
        # Реальные значения полей всегда длиннее 24 символов.
        if len(val) <= 24 and _FALSE_VALUE_TIME_RE.match(val):
            rejected_values.append(val)
            continue

        # Поле принято
        if num not in result:
            # Присоединяем накопленные отброшенные значения к этому полю
            if rejected_values:
                val = "\n".join(rejected_values + [val])
                rejected_values.clear()
            result[num] = val
            last_num = n

    # Оставшиеся отброшенные значения — в последнее поле
    if rejected_values and result:
        last_key = list(result.keys())[-1]
        result[last_key] = result[last_key] + "\n" + "\n".join(rejected_values)

    # ── Обрезка подписей в значениях полей ──
    result = {k: strip_signature_from_value(v) for k, v in result.items()}

    return result


def extract_fields_doc_form(text: str, dpr_type: str = "МОРЕ") -> dict[str, str]:
    """
    Парсер для формата таблицы Word .doc: каждая строка объединяет
    метку и значение одного поля (из двух колонок таблицы):
        "1.Название судна1.  Спасатель Заборщиков"
        "5. Запасы-расход...             5. ДТ 100.9 – 0.4 / ТТ – 0..."

    Стратегия: берём ПОСЛЕДНЕЕ вхождение "N. " в строке —
    это всегда начало колонки со значением.
    """
    max_field = 10 if dpr_type == "ПОРТ" else 14

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
        if num.isdigit():
            n = int(num)
            if n > max_field:
                continue
        val = re.sub(r"\s+", " ", line[last.end():]).strip()
        # Убираем '\r' и лишние пробелы внутри значения
        val = re.sub(r"[\r\n]+\s*", " ", val).strip()
        if num not in result and val:
            result[num] = val

    # ── Обрезка подписей в значениях полей ──
    result = {k: strip_signature_from_value(v) for k, v in result.items()}

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

        # Параграфы внутри таблиц — по XML-элементу (python-docx создаёт новые обёртки)
        table_para_elems: set = set()
        for tbl in doc.tables:
            for row in tbl.rows:
                for cell in row.cells:
                    for para in cell.paragraphs:
                        table_para_elems.add(id(para._element))

        # Нетабличные параграфы
        parts = [p.text for p in doc.paragraphs
                 if p.text.strip() and id(p._element) not in table_para_elems]

        # Таблицы: если 2 колонки — колонка 1 лейбл (N. Описание), колонка 2 значение
        for tbl in doc.tables:
            for row in tbl.rows:
                cells = [c.text.strip() for c in row.cells]
                non_empty = [c for c in cells if c]
                if len(non_empty) >= 2:
                    label, value = non_empty[0], non_empty[1]
                    m = re.match(r'^(\d{1,2})[.)]\s*', label)
                    if m:
                        # Убрать числовой префикс из колонки значения (если есть)
                        val = re.sub(r'^\d{1,2}[.)]\s*', '', value).strip() or value
                        parts.append(f"{m.group(1)}.  {val}")
                    else:
                        parts.append("  ".join(non_empty))
                elif non_empty:
                    parts.append(non_empty[0])

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
#  ПАРСИНГ MSG ЧЕРЕЗ CFB (OLE) — порт с TypeScript parseDpr.ts
# ════════════════════════════════════════════════════════════════════════════

def _decode_utf16le(raw: bytes) -> str:
    """Декодирует UTF-16LE строку из MSG свойства, обрезая \x00."""
    try:
        return raw.decode("utf-16-le", errors="replace").replace("\x00", "").strip()
    except Exception:
        return ""

def extract_msg_time(raw_msg: bytes) -> Optional[str]:
    """
    Извлекает PR_CLIENT_SUBMIT_TIME (0x0039, тип FILETIME 0x0040)
    из __properties_version1.0 корневого storage MSG-файла.
    Возвращает UTC ISO-строку или None.
    """
    try:
        if not HAS_OLEFILE or raw_msg[:4] != b'\xd0\xcf\x11\xe0':
            return None
        ole = olefile.OleFileIO(io.BytesIO(raw_msg))
        if not ole.exists("__properties_version1.0"):
            ole.close()
            return None
        props = ole.openstream("__properties_version1.0").read()
        ole.close()

        # Свойства начинаются с offset 32, каждое по 16 байт
        pos = 32
        while pos + 16 <= len(props):
            tag_type = struct.unpack_from("<H", props, pos)[0]       # bytes 0-1
            tag_id   = struct.unpack_from("<H", props, pos + 2)[0]   # bytes 2-3
            if tag_id == 0x0039 and tag_type == 0x0040:              # PR_CLIENT_SUBMIT_TIME, FILETIME
                filetime = struct.unpack_from("<Q", props, pos + 8)[0]  # bytes 8-15
                # FILETIME → Unix ms: (filetime / 10000) - 11644473600000
                unix_ms = int(filetime / 10000) - 11644473600000
                if unix_ms > 0:
                    return datetime.fromtimestamp(unix_ms / 1000, tz=timezone.utc).isoformat()
            pos += 16
        return None
    except Exception as e:
        log.debug(f"extract_msg_time error: {e}")
        return None

def _read_msg_attachments_cfb(raw_msg: bytes) -> list[tuple[str, bytes]]:
    """
    Извлекает вложения из MSG (OLE/CFB) через olefile.
    Возвращает список (имя_файла, бинарные_данные).
    """
    attachments: list[tuple[str, bytes]] = []
    if not HAS_OLEFILE or raw_msg[:4] != b'\xd0\xcf\x11\xe0':
        return attachments
    try:
        ole = olefile.OleFileIO(io.BytesIO(raw_msg))
        dirs = ole.listdir()
        # Группируем по директории вложения
        attach_dirs: dict[str, dict[str, bytes]] = {}
        for entry in dirs:
            path = "/".join(entry)
            if "__attach_version1.0" in path:
                dir_name = entry[0]  # e.g. "__attach_version1.0_#00000000"
                prop_name = entry[-1]
                if dir_name not in attach_dirs:
                    attach_dirs[dir_name] = {}
                try:
                    attach_dirs[dir_name][prop_name] = ole.openstream(entry).read()
                except Exception:
                    pass

        for dir_name, props in attach_dirs.items():
            data = props.get("__substg1.0_37010102")
            if data is None:
                continue
            # Имя файла
            name = ""
            raw_name = props.get("__substg1.0_3707001F")
            if raw_name:
                name = _decode_utf16le(raw_name)
            if not name:
                raw_ext = props.get("__substg1.0_3704001F")
                if raw_ext:
                    name = _decode_utf16le(raw_ext)
            if not name:
                name = f"attachment_{dir_name[-8:]}.bin"
            attachments.append((name, data))

        ole.close()
    except Exception as e:
        log.debug(f"_read_msg_attachments_cfb error: {e}")
    return attachments

def _read_docx_from_bytes(data: bytes) -> str:
    """Извлекает текст из .docx (ZIP/XML) без python-docx.

    Таблицы с двумя колонками («N. Описание» | «значение») обрабатываются
    отдельно — берётся только колонка значения, лейблы не попадают в поля.

    Многосекционные документы (Демидов): параграф из одних дефисов
    трактуется как разделитель секций. При дублировании номеров полей
    между секциями — сохраняется первое вхождение.
    """
    def _para_text(p_xml: str) -> str:
        texts = re.findall(r"<w:t[^>]*>(.*?)</w:t>", p_xml)
        t = "".join(texts)
        t = t.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
        t = t.replace("&apos;", "'").replace("&quot;", "\"")
        t = re.sub(r"&#x([0-9a-fA-F]+);", lambda m: chr(int(m.group(1), 16)), t)
        t = re.sub(r"&#(\d+);", lambda m: chr(int(m.group(1))), t)
        return t.strip()

    # Паттерн разделителя секций: строка из одних дефисов/тире
    _SECTION_SEP_RE = re.compile(r"^[-–—]{3,}\s*$")

    try:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            if "word/document.xml" not in zf.namelist():
                return ""
            xml_text = zf.read("word/document.xml").decode("utf-8", errors="replace")

        lines: list[str] = []
        seen_field_nums: set[str] = set()

        # Убираем таблицы из основного потока, чтобы не читать их параграфы дважды
        xml_no_tables = re.sub(r"<w:tbl\b[^>]*>.*?</w:tbl>", "", xml_text, flags=re.DOTALL)

        # Нетабличные параграфы
        for p in re.findall(r"<w:p[^>]*>(.*?)</w:p>", xml_no_tables, re.DOTALL):
            line = _para_text(p)
            if not line:
                continue
            # Разделитель секций?
            if _SECTION_SEP_RE.match(line):
                lines.append("---")
                continue
            # Детектируем номер поля в строке
            fm = re.match(r"^(\d{1,2})[.)]", line)
            if fm:
                fnum = str(int(fm.group(1)))
                if fnum in seen_field_nums:
                    # Дубликат номера поля — вторая секция, пропускаем
                    continue
                seen_field_nums.add(fnum)
            lines.append(line)

        # Таблицы: двухколоночный формат ДПР (лейбл | значение)
        for tbl in re.findall(r"<w:tbl\b[^>]*>(.*?)</w:tbl>", xml_text, re.DOTALL):
            for row in re.findall(r"<w:tr\b[^>]*>(.*?)</w:tr>", tbl, re.DOTALL):
                cells = re.findall(r"<w:tc\b[^>]*>(.*?)</w:tc>", row, re.DOTALL)
                cell_texts = []
                for cell in cells:
                    paras = re.findall(r"<w:p[^>]*>(.*?)</w:p>", cell, re.DOTALL)
                    ct = " ".join(_para_text(p) for p in paras).strip()
                    if ct:
                        cell_texts.append(ct)
                if len(cell_texts) >= 2:
                    label, value = cell_texts[0], cell_texts[1]
                    m = re.match(r"^(\d{1,2})[.)]\s*", label)
                    if m:
                        fnum = str(int(m.group(1)))
                        if fnum in seen_field_nums:
                            continue  # Дубликат — пропускаем
                        seen_field_nums.add(fnum)
                        val = re.sub(r"^\d{1,2}[.)]\s*", "", value).strip() or value
                        lines.append(f"{m.group(1)}.  {val}")
                    else:
                        lines.append("  ".join(cell_texts))
                elif cell_texts:
                    lines.append(cell_texts[0])

        return "\n".join(lines)
    except Exception as e:
        log.debug(f"_read_docx_from_bytes error: {e}")
        return ""

def _has_numbered_lines(text: str) -> bool:
    """Проверяет наличие нумерованных строк ДПР в тексте."""
    return bool(re.search(r"(?:^|\n)\s*\d+\s*[.)]", text, re.MULTILINE))

def _read_text_attachment(data: bytes) -> str:
    """Пытается прочитать вложение как текст (UTF-8 или UTF-16LE)."""
    # UTF-8
    try:
        text = data.decode("utf-8", errors="replace")
        if _has_numbered_lines(text):
            return text
    except Exception:
        pass
    # UTF-16LE
    try:
        text = data.decode("utf-16-le", errors="replace")
        if _has_numbered_lines(text):
            return text
    except Exception:
        pass
    return ""

def _read_eml_from_bytes(data: bytes) -> str:
    """
    Извлекает текст из RFC-822 .eml файла (пересланное письмо).
    Обходит все MIME-части, собирает text/plain.
    """
    try:
        msg = _email_lib.message_from_bytes(data)
        parts: list[str] = []

        def _walk(part) -> None:
            ct = part.get_content_type()
            if ct == "text/plain":
                payload = part.get_payload(decode=True)
                if payload:
                    charset = part.get_param("charset") or "utf-8"
                    try:
                        parts.append(payload.decode(charset, errors="replace"))
                    except (LookupError, UnicodeDecodeError):
                        parts.append(payload.decode("utf-8", errors="replace"))
            elif part.is_multipart():
                for sub in part.get_payload():
                    if hasattr(sub, "get_content_type"):
                        _walk(sub)

        _walk(msg)
        return "\n\n".join(t for t in parts if t.strip())
    except Exception as e:
        log.debug(f"_read_eml_from_bytes error: {e}")
        return ""


def extract_all_text_from_msg(raw_msg: bytes, subject: str = "") -> tuple[str, str, bool]:
    """
    Извлекает текст ДПР из MSG-файла (CFB/OLE).
    Приоритет: вложения (.docx/.doc/.dat/.txt/.eml) → тело письма.
    Возвращает (текст, тип_ДПР, is_doc_form).
    """
    text = ""
    is_form = False

    # 1. Вложения
    attachments = _read_msg_attachments_cfb(raw_msg)
    for fname, data in attachments:
        fname_lower = fname.lower()
        if fname_lower.endswith(".docx"):
            t = _read_docx_from_bytes(data)
            if t.strip():
                log.info(f"CFB вложение .docx: {fname}")
                text, is_form = t, False
                break
        elif fname_lower.endswith(".doc"):
            t, form = read_doc_attachment(data)
            if t.strip():
                log.info(f"CFB вложение .doc: {fname}")
                text, is_form = t, form
                break
        elif fname_lower.endswith(".txt") or fname_lower.endswith(".dat"):
            t = _read_text_attachment(data)
            if t.strip():
                log.info(f"CFB вложение text: {fname}")
                text, is_form = t, False
                break
        elif fname_lower.endswith(".eml"):
            # RFC-822 пересланное письмо (.eml) — парсим Python email
            t = _read_eml_from_bytes(data)
            if t.strip():
                log.info(f"CFB вложение .eml (RFC-822): {fname}")
                text, is_form = t, False
                break
        else:
            # Неизвестное расширение — пробуем как текст
            t = _read_text_attachment(data)
            if t.strip():
                log.info(f"CFB вложение (generic): {fname}")
                text, is_form = t, False
                break

    # 2. Фолбэк: тело письма
    if not text.strip():
        try:
            ole = olefile.OleFileIO(io.BytesIO(raw_msg))
            if ole.exists("__substg1.0_1000001F"):
                body_raw = ole.openstream("__substg1.0_1000001F").read()
                body_text = _decode_utf16le(body_raw)
                if body_text.strip():
                    log.info("CFB тело письма (1000001F)")
                    text = body_text
            ole.close()
        except Exception:
            pass

    # 3. Определяем тип ДПР
    dpr_type = detect_report_type(subject, text[:400]) if text.strip() else ""

    return text, dpr_type, is_form


# ════════════════════════════════════════════════════════════════════════════
#  НОВЫЕ КОЛОНКИ vessel_dpr — парсинг запасов, погоды, курса, ETA
# ════════════════════════════════════════════════════════════════════════════

_SUPPLY_MAX = 99_999.99  # numeric(7,2) в Supabase — максимум


def _safe_float(s: str) -> Optional[float]:
    """Безопасное преобразование строки в float (None при ошибке или >_SUPPLY_MAX)."""
    try:
        v = float(s.replace(" ", "").replace(",", "."))
        # Значения ≥ 100 000 явно некорректны (overflow numeric(7,2)) — возвращаем None
        if abs(v) >= 100_000:
            log.warning(f"  _safe_float: значение {v} превышает лимит колонки — игнорируем")
            return None
        return v
    except (ValueError, AttributeError):
        return None


def parse_supplies_numeric(fields: dict[str, str]) -> dict[str, Optional[float]]:
    """
    Извлекает числовые значения запасов из поля 5.
    Поддерживает все реальные форматы:
      ДТ 100 – 5 / М 200 – 0 / В 50 – 2
      ДТ(т) - 41,49 (82%); Масло(л)- 547 (56%)
      ДТ: 124,550-0,100 / М: M10: 223-0; M14: 1261-0
      ДТ 270,8(29,1%)- 5,4/ М-ГДГ 6940(46,3%)-50,0 / М-ВДГ 372
      ДТ- 165,7 т (- 0,0 т) / М-900кг - 0 кг / В -
      ДТ - 111,7 т. - 0,0 т / ТТ Нет / М 18511 кг. / В 116,0 т -
      ДТ 2827 - 1575 / ТТ 227.950 - 0 / М 770,0 – 0,0 / В 38 - 2

    Масла всех видов (М, М1, М2, М-ГДГ, М-ВДГ, МГД, МВДГ, МГ, Масло,
    M10, M14, TPL) суммируются в oil_amt / oil_cons.
    ДТ+ТТ суммируются в fuel_liters через отдельную агрегацию в dpr_ximss.

    Возвращает словарь с ключами: fuel_dt_amt, fuel_dt_cons, fuel_tt_amt, ...
    """
    result: dict[str, Optional[float]] = {
        "fuel_dt_amt": None, "fuel_dt_cons": None,
        "fuel_tt_amt": None, "fuel_tt_cons": None,
        "oil_amt": None, "oil_cons": None,
        "water_amt": None, "water_cons": None,
    }
    raw = fields.get("5", "").strip()
    if not raw:
        return result

    # ── Нормализация ──
    # Переносы строк → " / " чтобы не склеить лейбл со значением
    raw = re.sub(r"\s*\n\s*", " / ", raw)
    # Убираем % и (скобки) — метаданные о проценте остатка
    raw = re.sub(r"\(\d{1,3}[,.]?\d*\s*%\)", "", raw)
    raw = re.sub(r"\d{1,3}[,.]?\d*\s*%", "", raw)
    # Убираем префикс номера поля "5. " или "5) "
    raw = re.sub(r"^\d{1,2}\s*[.)]\s*", "", raw).strip()

    # ── Типы поставок ──
    # fuel_dt: ДТ, IFO, DT
    # fuel_tt: ТТ, MGO, TT
    # oil (суммируем): М, M, М1, M1, М2, M2, М-ГДГ, М-ВДГ, МГД, МВДГ, МГ,
    #                   Масло, M10, M14, TPL, ТРL
    # water: В, V, Вода
    # ignore: Продукты, НЕТ, Нет, -

    OIL_LABELS = (
        r"м(?:асло)?|m|м[-\s]?гдг|m[-\s]?gdg|м[-\s]?вдг|m[-\s]?vdg"
        r"|мгд|мвдг|мг|m10|m14|tpl|трl"
        r"|м[12]|m[12]"
    )

    # Разбиваем на сегменты: по " / ", " ; ", или по границе новой метки
    # Сначала нормализуем двоеточия: "ДТ: 124" → "ДТ 124"
    raw = re.sub(r"(ДТ|ТТ|М|В)\s*:", r"\1 ", raw, flags=re.I)
    raw = re.sub(rf"({OIL_LABELS})\s*:", r"\1 ", raw, flags=re.I)

    tokens = re.split(r"\s*/\s*|\s*;\s*", raw)

    # Аккумуляторы для масла
    oil_amt_total = 0.0
    oil_cons_total = 0.0
    oil_has_data = False

    for token in tokens:
        token = token.strip()
        if not token or re.match(r"^(нет|net|продукты|products|-)$", token, re.I):
            continue

        # ── Определяем тип поставки ──
        supply_family = ""  # "fuel_dt", "fuel_tt", "oil", "water"

        # ДТ / IFO
        if re.match(r"^(ДТ|DT|IFO)\b", token, re.I):
            supply_family = "fuel_dt"
        # ТТ / MGO
        elif re.match(r"^(ТТ|TT|MGO)\b", token, re.I):
            supply_family = "fuel_tt"
        # Вода
        elif re.match(r"^(В|V|Вода|Water)\b", token, re.I):
            supply_family = "water"
        # Масло (все виды)
        elif re.match(rf"^({OIL_LABELS})\b", token, re.I):
            supply_family = "oil"
        # Голые числа без метки — пропускаем
        elif re.match(r"^\d", token):
            # Может быть продолжением предыдущего сегмента после переноса
            continue
        else:
            continue

        # ── Убираем метку и единицы измерения ──
        # Убираем лидирующую метку
        cleaned = token
        cleaned = re.sub(r"^(ДТ|DT|IFO|ТТ|TT|MGO)\s*[:-]?\s*", "", cleaned, flags=re.I)
        cleaned = re.sub(rf"^({OIL_LABELS})\s*[:-]?\s*", "", cleaned, flags=re.I)
        cleaned = re.sub(r"^(В|V|Вода|Water)\s*[:-]?\s*", "", cleaned, flags=re.I)
        # После снятия основного лейбла убираем:
        # 1) Суб-лейбл масла (марка): "M10 ", "M14 ", "МГД " — чтобы "М M10 223-0" → "223-0"
        cleaned = re.sub(rf"^({OIL_LABELS})\s*[:-]?\s*", "", cleaned, flags=re.I)
        # 2) Вязкостная марка: "15w40", "5W30", "10W40" — чтобы "15w40: 5202-0" → "5202-0"
        cleaned = re.sub(r"^\d+[wW]\d+\s*[:-]?\s*", "", cleaned)
        # Убираем единицы измерения: т, т., кг, кг., л, (т), (л), (кг)
        cleaned = re.sub(r"\s*(?:т\.|т|кг\.?|кг|л|г)\b\s*", " ", cleaned, flags=re.I)
        cleaned = re.sub(r"\(\s*(?:т|кг|л)\s*\)", "", cleaned, flags=re.I)
        cleaned = cleaned.strip()

        if not cleaned or cleaned in ("-", "—", "–"):
            continue

        # Нормализуем точку-десятичный разделитель В ЧИСЛАХ (не в датах!)
        # 227.950 → 227.950 (уже float-совместимо)
        # Пропускаем если похоже на дату
        if not re.match(r"\d{1,2}\.\d{2}\.\d{2,4}", cleaned):
            # Заменяем . на , только если это десятичный разделитель
            # (окружён цифрами и не является частью разделителя тысяч)
            cleaned = re.sub(r"(\d)\.(\d)", r"\1,\2", cleaned)

        # ── Извлекаем остаток и расход ──
        # Ищем числа: первое — остаток, после тире/дефиса — расход
        nums = re.findall(r"(\d[\d\s]*[\d,.]*)", cleaned)
        nums_clean: list[float] = []
        for n in nums:
            v = _safe_float(n)
            if v is not None:
                nums_clean.append(v)

        amt: Optional[float] = None
        cons: Optional[float] = None

        if nums_clean:
            amt = nums_clean[0]

        # Расход: после тире/дефиса
        dash_m = re.search(r"[-–—]\s*(\d[\d\s]*[\d,.]*)", cleaned)
        if dash_m:
            cons_val = _safe_float(dash_m.group(1))
            if cons_val is not None:
                cons = cons_val
        elif len(nums_clean) > 1:
            cons = nums_clean[1]

        # Нормализация: если после дефиса "OO" → 0
        if dash_m and re.match(r"^OO$", dash_m.group(1).strip(), re.I):
            cons = 0.0

        # ── Конвертация кг→т ──
        # Для топлива (ДТ, ТТ) и воды: >2000 остаток или >50 расход → кг
        if supply_family in ("fuel_dt", "fuel_tt", "water"):
            if amt is not None and amt > 2000:
                amt = round(amt / 1000, 2)
            if cons is not None and cons > 50:
                cons = round(cons / 1000, 2)

        # ── Запись в результат ──
        if supply_family == "fuel_dt":
            if amt is not None:
                result["fuel_dt_amt"] = round(amt, 2)
            if cons is not None:
                result["fuel_dt_cons"] = round(cons, 2)
        elif supply_family == "fuel_tt":
            if amt is not None:
                result["fuel_tt_amt"] = round(amt, 2)
            if cons is not None:
                result["fuel_tt_cons"] = round(cons, 2)
        elif supply_family == "water":
            if amt is not None:
                result["water_amt"] = round(amt, 2)
            if cons is not None:
                result["water_cons"] = round(cons, 2)
        elif supply_family == "oil":
            oil_has_data = True
            if amt is not None:
                oil_amt_total += amt
            if cons is not None:
                oil_cons_total += cons

    # ── Суммированное масло ──
    if oil_has_data:
        result["oil_amt"] = round(oil_amt_total, 2) if oil_amt_total > 0 else None
        result["oil_cons"] = round(oil_cons_total, 2) if oil_cons_total > 0 else None

    return result

def parse_weather(fields: dict[str, str]) -> Optional[str]:
    """Поле 6 — погода (только МОРЕ)."""
    return fields.get("6", "").strip() or None

def parse_course_speed(fields: dict[str, str]) -> tuple[Optional[float], Optional[float], Optional[float]]:
    """
    Поле 7 — курс/скорость (только МОРЕ).
    Возвращает (course, speed_current, distance_day).
    Токены: курс / скорость / средняя / миль за сутки / ...
    """
    raw = fields.get("7", "").strip()
    if not raw:
        return None, None, None
    tokens = re.split(r"\s*/\s*", raw)
    course = speed = distance = None

    # Курс (токен 0)
    if len(tokens) > 0:
        t0 = tokens[0].strip()
        if t0.lower() in ("пер", "переход", "дп", "dp", "нет", ""):
            course = None
        else:
            try:
                course = float(t0.replace(",", "."))
                if not (0 <= course <= 360):
                    course = None
            except ValueError:
                course = None

    # Скорость текущая (токен 1)
    if len(tokens) > 1:
        try:
            speed = float(tokens[1].strip().replace(",", "."))
        except ValueError:
            speed = None

    # Миль за сутки (токен 3, если есть)
    if len(tokens) > 3:
        try:
            distance = float(tokens[3].strip().replace(",", "."))
        except ValueError:
            distance = None

    return course, speed, distance

def parse_eta(fields: dict[str, str]) -> tuple[Optional[str], Optional[str]]:
    """
    Поле 11 — ETA (только МОРЕ).
    Возвращает (eta_place, eta_date).
    eta_place — текст до первой даты DD.MM или DD/MM.
    """
    raw = fields.get("11", "").strip()
    if not raw:
        return None, None

    # Ищем дату
    date_m = re.search(r"(\d{2}[./]\d{2}(?:[./]\d{2,4})?)", raw)
    if date_m:
        place = raw[:date_m.start()].strip().rstrip("/- ")
        date_str = date_m.group(1)
        return (place or None), date_str
    return raw.strip() or None, None

def parse_power_source(fields: dict[str, str]) -> Optional[str]:
    """Поле 7 — электропитание СЭП/БЭП (только ПОРТ)."""
    raw = fields.get("7", "").strip().upper()
    if "СЭП" in raw or "SEP" in raw:
        return "СЭП"
    if "БЭП" in raw or "BEP" in raw:
        return "БЭП"
    return raw if raw else None

def parse_port_status(fields: dict[str, str]) -> Optional[str]:
    """Поля 8+9 — статус порта (только ПОРТ)."""
    f8 = fields.get("8", "").strip()
    f9 = fields.get("9", "").strip()
    parts = [p for p in (f8, f9) if p and not re.match(r"^(нет|[-–—])$", p, re.I)]
    return " | ".join(parts) if parts else None

def parse_crew(fields: dict[str, str]) -> Optional[str]:
    """
    Поле 10 — количество экипажа.
    Берём только первую строку (до \n) чтобы отрезать подпись / email-сигнатуру.
    """
    raw = fields.get("10", "").strip()
    if not raw:
        return None
    # Берём только первую непустую строку
    first_line = raw.split("\n")[0].strip()
    return first_line or None


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

_PERSON_NAME_RE = re.compile(
    r"^(капитан|кап[.]|км[.]?|к-н|master|km)\s+[А-ЯЁа-яёA-Za-z]",
    re.I,
)

def extract_vessel_name(fields: dict[str, str], sender: str, subject: str) -> str:
    # П.1 — главный источник
    f1 = re.sub(r"[«»\u201c\u201d]", "", fields.get("1", "")).strip()
    if f1 and len(f1) > 2 and not _PERSON_NAME_RE.match(f1):
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
    fields = extract_fields_doc_form(body, rtype) if is_doc_form else extract_fields(body, rtype)
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
