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

    # 1. Точное совпадение
    if text in ports:
        return ports[text]

    # 2. Поиск наиболее длинного совпадающего ключа
    #    (специфичный причал важнее общего порта)
    best_key: Optional[str] = None
    best_len = 0

    for key in ports:
        if key in text or text in key:
            if len(key) > best_len:
                best_key, best_len = key, len(key)

    if best_key:
        return ports[best_key]

    return None, None
