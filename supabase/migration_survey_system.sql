-- Survey System — custom-built surveys embedded in emails, responses stored in Supabase
-- No external APIs (no Google Forms, no Typeform). One-click responses via HMAC-verified links.

-- ═══════════════════════════════════════════════════════════════════════
-- survey_campaigns — defines a set of questions to send to a target group
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS survey_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  target_states TEXT[] DEFAULT '{}',        -- e.g. ['GA','AL','MS'] — states to survey
  target_statuses TEXT[] DEFAULT '{}',      -- prospect statuses to target (e.g. follow_up_exhausted, held)
  status TEXT NOT NULL DEFAULT 'draft',     -- draft, active, paused, completed
  send_count INTEGER DEFAULT 0,
  response_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  properties JSONB DEFAULT '{}'::jsonb      -- extensible metadata
);

-- ═══════════════════════════════════════════════════════════════════════
-- survey_questions — ordered questions belonging to a campaign
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS survey_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES survey_campaigns(id) ON DELETE CASCADE,
  question_order INTEGER NOT NULL DEFAULT 0,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'single_choice', -- single_choice, scale, free_text
  options JSONB DEFAULT '[]'::jsonb,        -- array of {label, value} for choice/scale questions
  required BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_survey_questions_campaign ON survey_questions(campaign_id, question_order);

-- ═══════════════════════════════════════════════════════════════════════
-- survey_responses — individual answers (one row per question per prospect)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS survey_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES survey_campaigns(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
  prospect_id UUID NOT NULL,                -- references recruitment_prospects(id)
  answer_value TEXT,                        -- the selected option value or free text
  answered_at TIMESTAMPTZ DEFAULT now(),
  properties JSONB DEFAULT '{}'::jsonb      -- metadata (e.g. response_method: email_click vs page)
);

CREATE INDEX IF NOT EXISTS idx_survey_responses_prospect ON survey_responses(prospect_id, campaign_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_campaign ON survey_responses(campaign_id, question_id);

-- Unique constraint: one answer per question per prospect per campaign
CREATE UNIQUE INDEX IF NOT EXISTS idx_survey_responses_unique 
  ON survey_responses(campaign_id, question_id, prospect_id);

-- ═══════════════════════════════════════════════════════════════════════
-- survey_sends — tracks which prospects received which survey (dedup + analytics)
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS survey_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES survey_campaigns(id) ON DELETE CASCADE,
  prospect_id UUID NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT now(),
  responded BOOLEAN DEFAULT false,
  responded_at TIMESTAMPTZ,
  resend_id TEXT,                            -- Resend email ID for tracking
  properties JSONB DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_survey_sends_unique ON survey_sends(campaign_id, prospect_id);
CREATE INDEX IF NOT EXISTS idx_survey_sends_campaign ON survey_sends(campaign_id, responded);

-- ═══════════════════════════════════════════════════════════════════════
-- RLS policies (service_role bypasses, anon gets nothing)
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE survey_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_sends ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (our API runs as service_role)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all' AND tablename = 'survey_campaigns') THEN
    CREATE POLICY "service_role_all" ON survey_campaigns FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all' AND tablename = 'survey_questions') THEN
    CREATE POLICY "service_role_all" ON survey_questions FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all' AND tablename = 'survey_responses') THEN
    CREATE POLICY "service_role_all" ON survey_responses FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all' AND tablename = 'survey_sends') THEN
    CREATE POLICY "service_role_all" ON survey_sends FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
