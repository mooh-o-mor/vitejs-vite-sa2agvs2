"""One-time cleanup of bad records from the initial dry-run phase."""
from dotenv import load_dotenv
import os
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
from supabase import create_client

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])

# Delete records that should not be there
cleanups = [
    # ПРИХОД/ОТХОД types are now skipped by the parser
    {"vessel_name": "нарвал", "dpr_type": "ПРИХОД"},
    # Bad vessel name from first test run
    {"vessel_name": "руби", "dpr_type": "МОРЕ"},
    {"vessel_name": "k martyshkin", "dpr_type": "ПОРТ"},
]

for cond in cleanups:
    q = sb.table("vessel_dpr").delete()
    for k, v in cond.items():
        q = q.eq(k, v)
    res = q.execute()
    count = len(res.data) if res.data else 0
    print(f"Deleted {count} rows: {cond}")

print("\nDone. Current records for today:")
res = sb.table("vessel_dpr").select("vessel_name,dpr_type,parse_ok").eq("report_date", "2026-05-25").order("vessel_name").execute()
print(f"Total: {len(res.data)}")
for r in res.data:
    ok = "OK" if r["parse_ok"] else "!"
    print(f"  [{ok}] {r['vessel_name']:30s} {r['dpr_type']}")
