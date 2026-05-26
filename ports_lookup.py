"""
ports_lookup.py — Python-зеркало src/lib/ports.ts
Используется для резолвинга текстовых локаций в координаты.
"""

from __future__ import annotations

import json
import os
import re
from typing import Optional

# ── Парсинг ports.ts ────────────────────────────────────────────────────────────

def load_ports(ts_path: str, extra_path: str = "") -> dict[str, tuple[float, float]]:
    """Читает src/lib/ports.ts + ports_extra.json → словарь {название: (lat, lng)}."""
    ports: dict[str, tuple[float, float]] = {}

    # Читаем ports.ts
    with open(ts_path, encoding="utf-8") as f:
        ts_text = f.read()

    for m in re.finditer(
        r"'([^']+)'\s*:\s*\[([0-9.+-]+),\s*([0-9.+-]+)\]",
        ts_text,
    ):
        key = m.group(1).strip().lower()
        ports[key] = (float(m.group(2)), float(m.group(3)))

    # Читаем ports_extra.json если есть
    if extra_path and os.path.exists(extra_path):
        with open(extra_path, encoding="utf-8") as f:
            extra = json.load(f)
        ports.update({k.lower(): tuple(v) for k, v in extra.items()})

    return ports


# ── Поиск порта ─────────────────────────────────────────────────────────────────

def lookup_port(
    coord_raw: str,
    ports: dict[str, tuple[float, float]],
) -> tuple[Optional[float], Optional[float]]:
    """Ищет coord_raw в словаре портов. Возвращает (lat, lng) или (None, None)."""
    if not coord_raw or not ports:
        return None, None

    text = coord_raw.strip().lower()
    # Убираем БЭП/СЭП, Да/Нет в конце
    text = re.sub(r"\s*(БЭП|СЭП|CЭП|Да|Нет)\s*$", "", text, flags=re.I).strip()
    # Убираем префикс "п. " / "порт " / "г. "
    text = re.sub(r"^п\.\s*порт\s+|^порт\s+|^г\.\s+|^п\.\s+", "", text, flags=re.I)
    # нормализуем пробел после/до дефиса: "санкт- петербург" → "санкт-петербург"
    text = re.sub(r"-\s+", "-", text)
    text = re.sub(r"\s+-", "-", text)
    # Убираем кавычки «»""
    text = re.sub(r'[«»""\']', "", text)

    # Разбиваем по " / " (с пробелами) и "," — но НЕ по голому "/"
    # (чтобы сохранить ключи вида "я/точка №12")
    raw_parts = re.split(r" / |,", text)
    parts = [p.strip() for p in raw_parts if p.strip()]

    # Порядок поиска: с конца (специфичное) → вся строка (общее)
    search_order = list(reversed(parts)) + [text]

    # Сортируем ключи по длине убывающей — специфичный причал важнее общего порта
    sorted_keys = sorted(ports.keys(), key=len, reverse=True)

    for chunk in search_order:
        for key in sorted_keys:
            if key in chunk:
                return ports[key]

    return None, None
