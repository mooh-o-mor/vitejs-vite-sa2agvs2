CREATE OR REPLACE FUNCTION get_latest_vessel_dpr(days_back int DEFAULT 30)
RETURNS SETOF vessel_dpr AS $$
  SELECT DISTINCT ON (vessel_name) *
  FROM vessel_dpr
  WHERE report_date >= (CURRENT_DATE - days_back)
    AND parse_ok = true
  ORDER BY vessel_name, report_date DESC
$$ LANGUAGE sql STABLE;
