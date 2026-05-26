-- Send velocity settings — key-value store for pacer configuration
-- Allows dashboard control without SSH/.env access
CREATE TABLE IF NOT EXISTS send_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT
);

-- Seed with current defaults (these override .env when present)
INSERT INTO send_settings (key, value, updated_by) VALUES
  ('send_target_per_hour', '6', 'migration'),
  ('send_daily_hard_cap', '200', 'migration'),
  ('send_hourly_hard_cap', '20', 'migration'),
  ('send_catchup_max_per_hour', '6', 'migration'),
  ('send_window_start', '8', 'migration'),
  ('send_window_end', '18', 'migration')
ON CONFLICT (key) DO NOTHING;

-- RLS: service role only (no public access)
ALTER TABLE send_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON send_settings
  FOR ALL USING (auth.role() = 'service_role');
