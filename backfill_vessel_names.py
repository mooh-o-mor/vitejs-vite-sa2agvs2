"""
backfill_vessel_names.py — Исправляет неправильные vessel_name в vessel_dpr
и заполняет vessel_type для всех записей.

Запуск: python backfill_vessel_names.py
"""

import os, sys, json
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://otjiwxvszomwpqmwusqd.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
if not SUPABASE_KEY:
    sys.exit("Укажите SUPABASE_KEY в .env")

import requests
from fleet_lookup import resolve_vessel, get_canonical_name

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}
url = f"{SUPABASE_URL}/rest/v1/vessel_dpr"

# Загружаем ВСЕ записи (vessel_name, id, vessel_type, fields_json)
res = requests.get(url, headers=headers, params={
    "select": "id,vessel_name,vessel_type,fields_json",
    "order": "id",
    "limit": 5000,
})
res.raise_for_status()
rows = res.json()
print(f"Всего записей: {len(rows)}")

name_fixed = 0
type_fixed = 0
skipped    = 0
errors     = 0

for row in rows:
    rid   = row["id"]
    vname = row.get("vessel_name", "")
    vtype = row.get("vessel_type")
    fields = row.get("fields_json") or {}
    if isinstance(fields, str):
        try: fields = json.loads(fields)
        except: fields = {}

    info = resolve_vessel(vname, fields)

    if not info:
        skipped += 1
        continue

    patch_data = {}

    # Исправляем имя если отличается
    if info.name != vname:
        patch_data["vessel_name"] = info.name

    # Заполняем тип если пустой
    if not vtype and info.vessel_type:
        patch_data["vessel_type"] = info.vessel_type

    if not patch_data:
        continue

    patch = requests.patch(
        f"{url}?id=eq.{rid}",
        headers=headers,
        json=patch_data,
    )
    if patch.ok:
        if "vessel_name" in patch_data:
            name_fixed += 1
            print(f"  ✓ id={rid} name: {vname!r} → {info.name!r} (type={info.vessel_type})")
        if "vessel_type" in patch_data:
            type_fixed += 1
    else:
        errors += 1
        print(f"  ✗ id={rid}: {patch.status_code} {patch.text[:80]}")

print(f"\nИтого: имён исправлено={name_fixed}, типов заполнено={type_fixed}, "
      f"не в реестре={skipped}, ошибок={errors}")
