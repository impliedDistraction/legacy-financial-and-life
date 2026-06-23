-- Agent Portal & Call Records Migration
-- Extends carrier_agents for the dialer platform, creates call_records for
-- legally-required call persistence (recordings, transcripts, consent).

-- ═══════════════════════════════════════════════════════════════
-- 1. Extend carrier_agents for the agent portal
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE carrier_agents
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'agent'
    CHECK (role IN ('agent', 'admin', 'synthetic')),
  ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'free'
    CHECK (tier IN ('free', 'leads', 'dialer', 'dialer_pro')),
  ADD COLUMN IF NOT EXISTS is_seated BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS seated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auth_token TEXT,
  ADD COLUMN IF NOT EXISTS auth_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS transfers_received INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transfers_converted INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_calls_handled INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS npn TEXT,
  ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}';

-- Index for quickly finding who's seated
CREATE INDEX IF NOT EXISTS idx_carrier_agents_seated
  ON carrier_agents (is_seated) WHERE is_seated = true AND active = true;

-- Index for auth token lookup
CREATE INDEX IF NOT EXISTS idx_carrier_agents_auth_token
  ON carrier_agents (auth_token) WHERE auth_token IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════
-- 2. call_records — persistent call log for legal compliance
-- ═══════════════════════════════════════════════════════════════
-- Every completed call is persisted here. Replaces the local JSONL files
-- as the source of truth. Recording URLs, full transcripts, consent status,
-- and qualification data are stored for compliance and analytics.

CREATE TABLE IF NOT EXISTS call_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id TEXT NOT NULL,                        -- session.id from bridge
  call_ts TIMESTAMPTZ NOT NULL DEFAULT now(),   -- when call started
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  caller_number TEXT,
  called_number TEXT,
  mode TEXT,                                    -- sales, recruitment, assistant, fwsys, etc.
  duration_s INTEGER,
  turns INTEGER,
  outcome TEXT,                                 -- qualified, opted_out, hangup, no_answer, transferred, booked
  -- Agent who handled / received transfer
  agent_id UUID REFERENCES carrier_agents(id),
  -- Prospect link (if outbound campaign call)
  prospect_id UUID,                             -- FK to recruitment_prospects or sales_leads
  prospect_name TEXT,
  -- Recording
  recording_url TEXT,                           -- Telnyx recording URL (MP3)
  recording_consent BOOLEAN DEFAULT false,      -- Whether recording consent was obtained
  -- Transcript (full conversation)
  transcript JSONB,                             -- [{role, text}] array
  -- Qualification slots collected
  slots JSONB,                                  -- {age, beneficiary, zip, ...}
  -- Timing data
  timings JSONB,                                -- Per-turn latency breakdown
  -- Metadata
  campaign_id UUID,                             -- recruitment_campaigns.id if applicable
  properties JSONB DEFAULT '{}',                -- Extensible metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_call_records_call_id ON call_records(call_id);
CREATE INDEX IF NOT EXISTS idx_call_records_call_ts ON call_records(call_ts DESC);
CREATE INDEX IF NOT EXISTS idx_call_records_agent_id ON call_records(agent_id) WHERE agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_call_records_prospect_id ON call_records(prospect_id) WHERE prospect_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_call_records_mode ON call_records(mode);
CREATE INDEX IF NOT EXISTS idx_call_records_outcome ON call_records(outcome);

-- ═══════════════════════════════════════════════════════════════
-- 3. Seed data — Josh as synthetic agent (system ignores for routing)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO carrier_agents (agent_name, agent_email, phone, role, licensed_states, notes)
VALUES (
  'Josh Byrom',
  'joshbyrom.mobile@gmail.com',
  '+16786334712',
  'synthetic',
  '{}',
  'Platform developer — synthetic agent for testing. System ignores for real routing.'
)
ON CONFLICT ON CONSTRAINT carrier_agents_email_unique DO UPDATE
  SET role = 'synthetic',
      phone = EXCLUDED.phone,
      notes = EXCLUDED.notes;

-- Update Beth with phone number for transfer routing
UPDATE carrier_agents
  SET phone = '+16784232980'
  WHERE agent_email = 'beth@legacyf-l.com' AND phone IS NULL;

-- Update Tim with phone number (same as Beth for now — update when Tim has a separate line)
UPDATE carrier_agents
  SET phone = '+16784232980'
  WHERE agent_email = 'tim@legacyf-l.com' AND phone IS NULL;

-- ═══════════════════════════════════════════════════════════════
-- 4. RLS policies (service role bypasses, portal reads own data)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE call_records ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (workers, admin)
CREATE POLICY call_records_service_all ON call_records
  FOR ALL USING (true) WITH CHECK (true);

-- Future: agents can read their own call records
-- CREATE POLICY call_records_agent_read ON call_records
--   FOR SELECT USING (agent_id = current_setting('app.agent_id')::uuid);

-- carrier_agents: ensure RLS is enabled but service role passes through
ALTER TABLE carrier_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY carrier_agents_service_all ON carrier_agents
  FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE call_records IS 'Persistent call log for legal compliance. Every completed voice call is recorded here with transcript, recording URL, and qualification data.';
COMMENT ON COLUMN carrier_agents.role IS 'agent=real agent, admin=Tim/platform admin, synthetic=test/dev agent (ignored by routing)';
COMMENT ON COLUMN carrier_agents.is_seated IS 'Whether agent is currently online and available for transfers';
