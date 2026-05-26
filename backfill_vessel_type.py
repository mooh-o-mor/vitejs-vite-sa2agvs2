"""
backfill_vessel_type.py — Заполняет vessel_dpr.vessel_type для существующих записей.

Требует: SUPABASE_KEY в .env или переменных окружения.
Запуск: python backfill_vessel_type.py
"""

import os, sys, json
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://otjiwxvszomwpqmwusqd.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
if not SUPABASE_KEY:
    sys.exit("Укажите SUPABASE_KEY в .env")

import requests
from fleet_lookup import resolve_vessel

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

# Загружаем все записи без vessel_type
url = f"{SUPABASE_URL}/rest/v1/vessel_dpr"
params = {
    "select": "id,vessel_name,fields_json",
    "vessel_type": "is.null",
    "order": "id",
}
res = requests.get(url, headers=headers, params=params)
res.raise_for_status()
rows = res.json()
print(f"Записей без vessel_type: {len(rows)}")

updated = 0
not_found = 0
errors = 0

for row in rows:
    rid = row["id"]
    vname = row.get("vessel_name", "")
    fields = row.get("fields_json") or {}
    if isinstance(fields, str):
        try: fields = json.loads(fields)
        except: fields = {}

    info = resolve_vessel(vname, fields)
    if not info:
        not_found += 1
        continue

    # PATCH одну запись по id
    patch = requests.patch(
        f"{url}?id=eq.{rid}",
        headers=headers,
        json={"vessel_type": info.vessel_type}
    )
    if patch.ok:
        updated += 1
        if updated <= 5 or updated % 20 == 0:
            print(f"  ✓ id={rid} {vname!r} → {info.vessel_type!r}")
    else:
        errors += 1
        print(f"  ✗ id={rid}: {patch.status_code} {patch.text[:80]}")

print(f"\nИтого: обновлено={updated}, не найдено в реестре={not_found}, ошибок={errors}")
