"""
populate_vessel_specs_type.py — Заполняет vessel_specs.vessel_type из !fleet.xlsx.

Требует: SUPABASE_KEY (service_role) в переменных окружения или .env
Запуск:
    SUPABASE_KEY=eyJ... python populate_vessel_specs_type.py
"""

import os, sys, re
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://otjiwxvszomwpqmwusqd.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
if not SUPABASE_KEY:
    sys.exit("Укажите SUPABASE_KEY в .env или переменных окружения")

from fleet_lookup import BY_NAME, BY_IMO, _norm

import requests

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

# Загружаем все строки vessel_specs
res = requests.get(
    f"{SUPABASE_URL}/rest/v1/vessel_specs?select=vessel_name,imo,vessel_type",
    headers=headers
)
res.raise_for_status()
rows = res.json()
print(f"Записей в vessel_specs: {len(rows)}")

updated = 0
skipped = 0
not_found = 0

for row in rows:
    name_raw = row.get("vessel_name", "")
    imo_raw  = row.get("imo")
    current_type = row.get("vessel_type")

    # Уже заполнен — пропускаем
    if current_type:
        skipped += 1
        continue

    # Ищем в fleet_lookup по IMO сначала
    info = None
    if imo_raw:
        info = BY_IMO.get(int(imo_raw))

    # По имени если IMO не нашёл
    if not info:
        key = _norm(name_raw)
        info = BY_NAME.get(key)

    if not info:
        print(f"  НЕ НАЙДЕН: {name_raw!r} (imo={imo_raw})")
        not_found += 1
        continue

    # Обновляем vessel_type
    patch_res = requests.patch(
        f"{SUPABASE_URL}/rest/v1/vessel_specs?vessel_name=eq.{requests.utils.quote(name_raw)}",
        headers=headers,
        json={"vessel_type": info.vessel_type}
    )
    if patch_res.ok:
        print(f"  ✓ {name_raw!r} → vessel_type={info.vessel_type!r}")
        updated += 1
    else:
        print(f"  ✗ {name_raw!r}: {patch_res.status_code} {patch_res.text[:100]}")

print(f"\nИтого: обновлено={updated}, уже заполнено={skipped}, не найдено={not_found}")
