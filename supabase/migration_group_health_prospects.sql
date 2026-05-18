-- Group Health Prospects table
-- Stores inbound leads from /group landing page (businesses approaching 50 FTE / ALE threshold)

CREATE TABLE IF NOT EXISTS group_health_prospects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_name TEXT NOT NULL,
  company_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  employee_count TEXT NOT NULL,  -- "20-34", "35-49", "50-99", "100+"
  state TEXT NOT NULL,           -- 2-letter state code
  county TEXT,                   -- County (from URL param or form)
  current_coverage TEXT,         -- "none", "shopping", "renewing", "switching"
  notes TEXT,
  source TEXT DEFAULT 'direct',  -- "direct", "ale_outreach", "referral", etc.
  status TEXT DEFAULT 'new',     -- "new", "contacted", "quoted", "won", "lost"
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  contacted_at TIMESTAMPTZ,
  properties JSONB DEFAULT '{}'::jsonb
);

-- Index for status-based queries
CREATE INDEX IF NOT EXISTS idx_group_health_status ON group_health_prospects(status);
CREATE INDEX IF NOT EXISTS idx_group_health_state ON group_health_prospects(state);
CREATE INDEX IF NOT EXISTS idx_group_health_email ON group_health_prospects(email);

-- RLS: service role only (no anon access)
ALTER TABLE group_health_prospects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON group_health_prospects
  FOR ALL USING (auth.role() = 'service_role');

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_group_health_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER group_health_updated_at
  BEFORE UPDATE ON group_health_prospects
  FOR EACH ROW EXECUTE FUNCTION update_group_health_updated_at();
