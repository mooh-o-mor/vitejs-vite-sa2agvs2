from dotenv import load_dotenv
import os
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
from supabase import create_client
sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_KEY"])
res = sb.table("vessel_dpr").select("vessel_name,dpr_type,parse_ok").eq("report_date", "2026-05-25").order("vessel_name").execute()
print(f"Total rows: {len(res.data)}")
for r in res.data:
    ok = "OK" if r["parse_ok"] else "!"
    print(f"  [{ok}] {r['vessel_name']:30s} {r['dpr_type']}")
