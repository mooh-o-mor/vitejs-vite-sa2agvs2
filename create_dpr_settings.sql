-- Запустить в Supabase SQL Editor

CREATE TABLE IF NOT EXISTS dpr_settings (
  id            integer PRIMARY KEY DEFAULT 1,
  run_requested boolean NOT NULL DEFAULT false,
  status        text    NOT NULL DEFAULT 'idle',   -- idle | running | done | error
  last_run_at   timestamptz,
  last_run_msg  text,
  CONSTRAINT single_row CHECK (id = 1)
);

INSERT INTO dpr_settings (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;

ALTER TABLE dpr_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dpr_settings_select" ON dpr_settings;
DROP POLICY IF EXISTS "dpr_settings_update" ON dpr_settings;

CREATE POLICY "dpr_settings_select" ON dpr_settings
  FOR SELECT USING (true);

CREATE POLICY "dpr_settings_update" ON dpr_settings
  FOR UPDATE USING (true);
