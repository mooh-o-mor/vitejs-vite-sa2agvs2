"""
fleet_lookup.py — Авторитетный справочник флота из !fleet.xlsx

Использование:
    from fleet_lookup import resolve_vessel, BY_IMO, BY_NAME

    # Поиск по имени
    info = resolve_vessel("к. мартышкин", {})
    # info = {"name": "капитан мартышкин", "type": "сбс", "imo": 8418435, ...}

    # Поиск по IMO
    info = BY_IMO.get(8418435)
"""

import os
import re
from typing import Optional

# Путь к xlsx относительно этого файла
_XLSX = os.path.join(os.path.dirname(__file__), "!fleet.xlsx")

# ── Типы данных ─────────────────────────────────────────────────────────────

class VesselInfo:
    __slots__ = ("name", "vessel_type", "imo", "branch", "project",
                 "year_built", "grt", "kw", "bp")
    def __init__(self, name, vessel_type, imo=None, branch=None,
                 project=None, year_built=None, grt=None, kw=None, bp=None):
        self.name        = name          # str, lowercase
        self.vessel_type = vessel_type   # str, lowercase: "мфасс", "сбс", ...
        self.imo         = imo           # int | None
        self.branch      = branch        # str | None  (Балтийский, Северный, …)
        self.project     = project       # str | None
        self.year_built  = year_built    # int | None
        self.grt         = grt           # float | None
        self.kw          = kw            # float | None
        self.bp          = bp            # float | None

    def __repr__(self):
        return f"<VesselInfo {self.name!r} type={self.vessel_type!r} imo={self.imo}>"


# ── Нормализация имени (аналог _clean_name + normalize_vessel_name) ─────────

_SKIP_TYPES = frozenset(["катер", "тип"])

_PREFIXES_RE = re.compile(
    r"^(мфасс|масс\b|асптр|мфассмасс|мтс|мбс|бсс|асс|нис|ссн|м\/с|т\/х|т\/к|"
    r"буксир|плавкран|пс|мсс|рвк|скб|сбс|сквп|сб|мвс|сбп|нсс|мб|спк|ск)\s+",
    re.I
)

def _norm(name: str) -> str:
    """Нормализует имя: убирает тип-префикс, кавычки, лишние пробелы → lowercase."""
    if not name:
        return ""
    s = re.sub(r'[«»""\']+', " ", name)
    s = _PREFIXES_RE.sub("", s.strip())
    return re.sub(r"\s{2,}", " ", s).strip().lower()


# ── Загрузка данных из fleet.xlsx ────────────────────────────────────────────

#: imo → VesselInfo
BY_IMO: dict[int, VesselInfo] = {}

#: normalized_name → VesselInfo
BY_NAME: dict[str, VesselInfo] = {}


def _load():
    """Загружает fleet.xlsx один раз при импорте."""
    try:
        import openpyxl
    except ImportError:
        return  # openpyxl не установлен — работаем без него

    if not os.path.exists(_XLSX):
        return

    try:
        wb = openpyxl.load_workbook(_XLSX, read_only=True, data_only=True)
        ws = wb["Судовой состав МСС"]
        rows = list(ws.iter_rows(values_only=True))
        wb.close()
    except Exception:
        return

    # Header: (№, Тип, Район, Наим.судна, Проект, Год, Тип судна, Класс,
    #          ИМО, Порт, Нотация, GRT, кВт, BP, Район плавания, Возраст,
    #          Длина, Ширина, Филиал)
    for row in rows[1:]:
        name_raw  = row[3]
        type_raw  = row[1]
        imo_raw   = row[8]
        branch    = row[18]
        project   = row[4]
        year      = row[5]
        grt       = row[11]
        kw        = row[12]
        bp        = row[13]

        if not name_raw or not type_raw:
            continue
        vtype = str(type_raw).strip().lower()
        if vtype in _SKIP_TYPES:
            continue

        name_canon = _norm(str(name_raw))
        if not name_canon:
            continue

        imo = int(imo_raw) if imo_raw and str(imo_raw).isdigit() else (
            int(imo_raw) if isinstance(imo_raw, (int, float)) and imo_raw else None
        )

        info = VesselInfo(
            name=name_canon,
            vessel_type=vtype,
            imo=imo,
            branch=str(branch).strip() if branch else None,
            project=str(project) if project else None,
            year_built=int(year) if year and str(year).isdigit() else (
                int(year) if isinstance(year, (int, float)) else None
            ),
            grt=float(grt) if grt else None,
            kw=float(kw) if kw else None,
            bp=float(bp) if bp and str(bp) not in ("н/п", "") else None,
        )

        BY_NAME[name_canon] = info
        if imo:
            BY_IMO[imo] = info


_load()


# ── Алиасы (латиница/сокращения → нормализованное имя) ──────────────────────

_ALIASES: dict[str, str] = {
    # Из fleetTypes.ts VESSEL_NAME_ALIASES
    "kalas":      "калас",
    "rostov":     "ростов великий",
    "svetlomor3": "светломор-3",
    "светломор3": "светломор-3",
    "светломор 3": "светломор-3",
    # Распространённые email-паттерны sh.XXX@morspas.ru
    # Добавляйте сюда по мере появления новых судов
    "k martyshkin":   "капитан мартышкин",
    "k.martyshkin":   "капитан мартышкин",
    "k beklemishev":  "капитан беклемишев",
    "k.beklemishev":  "капитан беклемишев",
    "lazurit":        "лазурит",
    "svetlomor 3":    "светломор-3",
    "epron":          "эпрон",
    "otto shmidt":    "отто шмидт",
    "otto.shmidt":    "отто шмидт",
    "neftegaz 55":    "нефтегаз-55",
    "yasny":          "ясный",
}


def _extract_imo_from_fields(fields: dict) -> Optional[int]:
    """
    Пытается найти IMO в поле 10 (экипаж/подпись).
    Паттерн: ИМО / IMO / imoN где N — 7 цифр.
    """
    raw = fields.get("10", "") or ""
    # IMO 7-значный номер
    m = re.search(r"\bIMO\s*[:#]?\s*(\d{7})\b", raw, re.I)
    if m:
        return int(m.group(1))
    # Просто 7 цифр подряд в строке "ИМО 8418435"
    m = re.search(r"\b(?:ИМО|IMO)\D{0,3}(\d{7})\b", raw, re.I)
    if m:
        return int(m.group(1))
    return None


def resolve_vessel(raw_name: str, fields: Optional[dict] = None) -> Optional[VesselInfo]:
    """
    Разрешает название судна в каноническую запись из fleet.xlsx.

    1. Точное совпадение по нормализованному имени
    2. Алиасы (латиница, email-паттерны)
    3. IMO из поля 10 (если fields переданы)
    4. Нечёткий частичный матч (подстрока)

    Возвращает VesselInfo или None.
    """
    if not raw_name:
        return None

    key = _norm(raw_name)

    # 1. Точное совпадение
    if key in BY_NAME:
        return BY_NAME[key]

    # 2. Алиасы
    alias = _ALIASES.get(key) or _ALIASES.get(raw_name.strip().lower())
    if alias:
        return BY_NAME.get(alias)

    # 3. IMO из поля 10
    if fields:
        imo = _extract_imo_from_fields(fields)
        if imo and imo in BY_IMO:
            return BY_IMO[imo]

    # 4. Нечёткий частичный матч (key является подстрокой канонического имени или наоборот)
    if len(key) >= 4:
        # Проверяем, является ли key частью какого-то канонического имени
        for canon, info in BY_NAME.items():
            if key in canon or canon in key:
                return info

    return None


def get_vessel_type(raw_name: str, fields: Optional[dict] = None) -> str:
    """Возвращает тип судна (lowercase) или '' если не найден."""
    info = resolve_vessel(raw_name, fields)
    return info.vessel_type if info else ""


def get_canonical_name(raw_name: str, fields: Optional[dict] = None) -> str:
    """
    Возвращает каноническое имя (lowercase) из fleet.xlsx,
    или нормализованный raw_name если не найден.
    """
    info = resolve_vessel(raw_name, fields)
    return info.name if info else _norm(raw_name)


if __name__ == "__main__":
    print(f"Загружено судов: {len(BY_NAME)}, с IMO: {len(BY_IMO)}")
    # Тест
    tests = [
        ("k martyshkin", {}),
        ("капитан мартышкин", {}),
        ("Балтика", {}),
        ("МФАСС Берингов Пролив", {}),
        ("k beklemishev", {}),
        ("светломор3", {}),
    ]
    for name, flds in tests:
        info = resolve_vessel(name, flds)
        print(f"  {name!r:30} → {info}")
