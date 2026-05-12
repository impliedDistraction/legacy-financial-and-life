-- ═══════════════════════════════════════════════════════════════════
-- BOOTSTRAP: All recruitment tables & migrations in dependency order
-- Run this once in Supabase SQL Editor (Legacy Financial: kxmojndpgxgbykxjtxba)
-- Safe to re-run — all statements use IF NOT EXISTS / IF NOT EXISTS.
-- ═══════════════════════════════════════════════════════════════════


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PHASE 1: Foundation tables                                     │
-- └─────────────────────────────────────────────────────────────────┘

-- 1a. recruitment_prospects (base table)
CREATE TABLE IF NOT EXISTS recruitment_prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  state TEXT,
  city TEXT,
  experience_level TEXT DEFAULT 'unknown',
  current_agency TEXT,
  notes TEXT,
  source TEXT DEFAULT 'csv_import',
  campaign_id UUID,
  campaign_name TEXT,
  email_subject TEXT,
  email_body TEXT,
  call_opener TEXT,
  call_voicemail TEXT,
  personal_notes TEXT,
  fit_score INTEGER,
  fit_reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  processed_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  properties JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_recruitment_prospects_status ON recruitment_prospects(status);
CREATE INDEX IF NOT EXISTS idx_recruitment_prospects_campaign ON recruitment_prospects(campaign_id);
CREATE INDEX IF NOT EXISTS idx_recruitment_prospects_email ON recruitment_prospects(email);
CREATE INDEX IF NOT EXISTS idx_recruitment_prospects_fit_score ON recruitment_prospects(fit_score DESC NULLS LAST);


-- 1b. recruitment_campaigns + research columns on prospects
CREATE TABLE IF NOT EXISTS public.recruitment_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  client text NOT NULL DEFAULT 'legacy',
  status text NOT NULL DEFAULT 'active',
  search_state text NOT NULL DEFAULT 'Georgia',
  search_filters jsonb NOT NULL DEFAULT '{}',
  credit_budget integer NOT NULL DEFAULT 100,
  credits_used integer NOT NULL DEFAULT 0,
  max_pages_per_run integer NOT NULL DEFAULT 20,
  schedule_interval_minutes integer NOT NULL DEFAULT 60,
  schedule_jitter_minutes integer NOT NULL DEFAULT 15,
  next_run_at timestamptz,
  last_run_at timestamptz,
  require_review boolean NOT NULL DEFAULT true,
  notes text DEFAULT '',
  created_by text DEFAULT 'unknown',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_active_next_run
  ON recruitment_campaigns (status, next_run_at)
  WHERE status = 'active';

ALTER TABLE recruitment_prospects
  ADD COLUMN IF NOT EXISTS research_status text DEFAULT 'unscored',
  ADD COLUMN IF NOT EXISTS research_score numeric(3,1),
  ADD COLUMN IF NOT EXISTS researched_at timestamptz,
  ADD COLUMN IF NOT EXISTS web_presence jsonb DEFAULT '{}';

-- Re-add campaign_id with FK if it doesn't have one
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_type = 'FOREIGN KEY'
      AND table_name = 'recruitment_prospects'
      AND constraint_name LIKE '%campaign_id%'
  ) THEN
    BEGIN
      ALTER TABLE recruitment_prospects
        ADD CONSTRAINT fk_prospect_campaign
        FOREIGN KEY (campaign_id) REFERENCES recruitment_campaigns(id);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_prospects_research_status
  ON recruitment_prospects (research_status)
  WHERE research_status = 'unscored';

CREATE OR REPLACE FUNCTION campaign_prospect_counts()
RETURNS TABLE (campaign_id uuid, status text, count bigint)
LANGUAGE sql STABLE
AS $$
  SELECT campaign_id, status, count(*)
  FROM recruitment_prospects
  WHERE campaign_id IS NOT NULL
  GROUP BY campaign_id, status;
$$;


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PHASE 2: Campaign-level config                                 │
-- └─────────────────────────────────────────────────────────────────┘

-- 2a. Campaign email config
ALTER TABLE recruitment_campaigns
  ADD COLUMN IF NOT EXISTS sign_off text DEFAULT 'Legacy Financial Recruiting Team',
  ADD COLUMN IF NOT EXISTS reply_to_email text DEFAULT NULL;

-- 2b. Interaction tracking on prospects
ALTER TABLE recruitment_prospects
  ADD COLUMN IF NOT EXISTS email_opened_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS email_clicked_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS replied_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS follow_up_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_interaction_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS interaction_stage text DEFAULT 'new';

CREATE INDEX IF NOT EXISTS idx_prospects_interaction_stage ON recruitment_prospects (interaction_stage);
CREATE INDEX IF NOT EXISTS idx_prospects_sent_at ON recruitment_prospects (sent_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_prospects_last_interaction ON recruitment_prospects (last_interaction_at DESC NULLS LAST);

-- 2c. Campaign source type
ALTER TABLE recruitment_campaigns
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'prophog';
COMMENT ON COLUMN recruitment_campaigns.source_type IS 'Lead source type: prophog, fl_licensee, csv, pool';


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PHASE 3: Prospect attribute columns                            │
-- └─────────────────────────────────────────────────────────────────┘

-- 3a. Prophog indexes
CREATE INDEX IF NOT EXISTS idx_recruitment_prospects_npn
  ON recruitment_prospects ((properties->>'npn'))
  WHERE properties->>'npn' IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_recruitment_prospects_source
  ON recruitment_prospects (source);

-- 3b. Missing columns
ALTER TABLE recruitment_prospects ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE recruitment_prospects ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE recruitment_prospects ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE recruitment_prospects ADD COLUMN IF NOT EXISTS edited_email_body TEXT;
ALTER TABLE recruitment_prospects ADD COLUMN IF NOT EXISTS call_made_at TIMESTAMPTZ;
ALTER TABLE recruitment_prospects ADD COLUMN IF NOT EXISTS call_outcome TEXT;
ALTER TABLE recruitment_prospects ADD COLUMN IF NOT EXISTS email_replied_at TIMESTAMPTZ;

-- 3c. DNC and consent columns
ALTER TABLE recruitment_prospects
  ADD COLUMN IF NOT EXISTS interaction_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS web_presence jsonb DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_prospects_dnc_status
  ON recruitment_prospects ((properties->>'dnc_status'));
CREATE INDEX IF NOT EXISTS idx_prospects_text_consent
  ON recruitment_prospects ((properties->>'text_consent'));
CREATE INDEX IF NOT EXISTS idx_prospects_source
  ON recruitment_prospects (source);

COMMENT ON COLUMN recruitment_prospects.web_presence IS 'Research findings: Google results, trait scores, signals array';

-- 3d. QA pipeline columns
ALTER TABLE recruitment_prospects
  ADD COLUMN IF NOT EXISTS qa_status TEXT,
  ADD COLUMN IF NOT EXISTS qa_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS qa_rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS qa_score INTEGER,
  ADD COLUMN IF NOT EXISTS draft_version INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN recruitment_prospects.qa_status IS 'QA check result: passed | failed | null (unchecked)';
COMMENT ON COLUMN recruitment_prospects.qa_rejection_reason IS 'Reason the QA agent rejected this draft';
COMMENT ON COLUMN recruitment_prospects.qa_score IS 'Quality score 0-100 from automated QA checks';
COMMENT ON COLUMN recruitment_prospects.draft_version IS 'Draft iteration count (increments on re-draft)';

CREATE INDEX IF NOT EXISTS idx_prospects_drafted
  ON recruitment_prospects (status, created_at ASC)
  WHERE status = 'drafted';

CREATE INDEX IF NOT EXISTS idx_prospects_reviewed
  ON recruitment_prospects (status, fit_score DESC NULLS LAST)
  WHERE status = 'reviewed';

-- 3e. Consent-first pipeline columns
ALTER TABLE recruitment_prospects
  ADD COLUMN IF NOT EXISTS followup_email_subject TEXT,
  ADD COLUMN IF NOT EXISTS followup_email_body TEXT,
  ADD COLUMN IF NOT EXISTS followup_call_opener TEXT,
  ADD COLUMN IF NOT EXISTS followup_call_voicemail TEXT,
  ADD COLUMN IF NOT EXISTS followup_processed_at TIMESTAMPTZ;

COMMENT ON COLUMN recruitment_prospects.followup_email_subject IS 'Subject for enriched follow-up email (post-interest, uses web_presence data)';
COMMENT ON COLUMN recruitment_prospects.followup_email_body IS 'Body for enriched follow-up email (4 paragraphs, personalized from research)';

CREATE INDEX IF NOT EXISTS idx_prospects_followup_ready
  ON recruitment_prospects (interaction_stage, research_status)
  WHERE interaction_stage = 'interested'
    AND research_status = 'scored'
    AND followup_email_body IS NULL;

CREATE INDEX IF NOT EXISTS idx_prospects_interested_unscored
  ON recruitment_prospects (last_interaction_at DESC NULLS LAST)
  WHERE research_status = 'unscored'
    AND interaction_stage = 'interested';

CREATE INDEX IF NOT EXISTS idx_prospects_referral_consent
  ON recruitment_prospects ((properties->>'referral_consent'))
  WHERE (properties->>'referral_consent') = 'true';

-- 3f. Auto-relaunch on campaigns
ALTER TABLE recruitment_campaigns
  ADD COLUMN IF NOT EXISTS auto_relaunch boolean DEFAULT false;


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PHASE 4: QA status migration (data fixups)                     │
-- └─────────────────────────────────────────────────────────────────┘

-- Move 'processed' → 'drafted' so QA agent can evaluate them
UPDATE recruitment_prospects
SET status = 'drafted', updated_at = now()
WHERE status = 'processed';

-- Move 'ready_to_send' → 'approved'
UPDATE recruitment_prospects
SET status = 'approved', updated_at = now()
WHERE status = 'ready_to_send';

-- Re-queue QA-rejected prospects that failed only for missing email
UPDATE recruitment_prospects
SET status = 'drafted', qa_status = NULL, qa_score = NULL,
    qa_rejection_reason = NULL, updated_at = now()
WHERE status = 'rejected'
  AND qa_rejection_reason IS NOT NULL
  AND qa_rejection_reason LIKE '%No valid email address%';

-- Updated counts RPC (includes new statuses)
CREATE OR REPLACE FUNCTION campaign_prospect_counts()
RETURNS TABLE (campaign_id uuid, status text, count bigint)
LANGUAGE sql STABLE
AS $$
  SELECT campaign_id, status, count(*)
  FROM recruitment_prospects
  WHERE campaign_id IS NOT NULL
  GROUP BY campaign_id, status;
$$;


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PHASE 5: Independent tables                                    │
-- └─────────────────────────────────────────────────────────────────┘

-- 5a. Worker reflections
CREATE TABLE IF NOT EXISTS worker_reflections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  worker TEXT NOT NULL,
  assignment_type TEXT NOT NULL,
  prospect_id UUID REFERENCES recruitment_prospects(id) ON DELETE SET NULL,
  campaign_id UUID,
  confidence SMALLINT NOT NULL CHECK (confidence BETWEEN 1 AND 10),
  outcome_summary TEXT NOT NULL,
  limiting_factors TEXT[] NOT NULL DEFAULT '{}',
  improvement_notes TEXT,
  data_gaps JSONB DEFAULT '{}',
  flags TEXT[] NOT NULL DEFAULT '{}',
  properties JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_reflections_prospect
  ON worker_reflections (prospect_id) WHERE prospect_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reflections_worker
  ON worker_reflections (worker, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reflections_low_confidence
  ON worker_reflections (confidence, created_at DESC) WHERE confidence <= 4;
CREATE INDEX IF NOT EXISTS idx_reflections_flagged
  ON worker_reflections USING gin (flags) WHERE array_length(flags, 1) > 0;

CREATE OR REPLACE FUNCTION reflection_limiting_factors(
  p_worker TEXT DEFAULT NULL,
  p_since TIMESTAMPTZ DEFAULT now() - INTERVAL '7 days'
)
RETURNS TABLE (factor TEXT, occurrences BIGINT, avg_confidence NUMERIC, worker_name TEXT)
LANGUAGE sql STABLE
AS $$
  SELECT unnest(limiting_factors) AS factor, count(*) AS occurrences,
    round(avg(confidence), 1) AS avg_confidence, worker AS worker_name
  FROM worker_reflections
  WHERE created_at >= p_since AND (p_worker IS NULL OR worker = p_worker)
  GROUP BY unnest(limiting_factors), worker
  ORDER BY occurrences DESC;
$$;

CREATE OR REPLACE FUNCTION reflection_confidence_trend(
  p_worker TEXT DEFAULT NULL,
  p_since TIMESTAMPTZ DEFAULT now() - INTERVAL '30 days'
)
RETURNS TABLE (day DATE, worker_name TEXT, avg_confidence NUMERIC, reflection_count BIGINT)
LANGUAGE sql STABLE
AS $$
  SELECT created_at::date AS day, worker AS worker_name,
    round(avg(confidence), 1) AS avg_confidence, count(*) AS reflection_count
  FROM worker_reflections
  WHERE created_at >= p_since AND (p_worker IS NULL OR worker = p_worker)
  GROUP BY created_at::date, worker
  ORDER BY day DESC;
$$;

CREATE OR REPLACE FUNCTION prospect_reflection_history(p_prospect_id UUID)
RETURNS TABLE (
  worker TEXT, assignment_type TEXT, confidence SMALLINT,
  outcome_summary TEXT, limiting_factors TEXT[],
  improvement_notes TEXT, flags TEXT[], created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE
AS $$
  SELECT worker, assignment_type, confidence, outcome_summary,
    limiting_factors, improvement_notes, flags, created_at
  FROM worker_reflections WHERE prospect_id = p_prospect_id
  ORDER BY created_at ASC;
$$;

COMMENT ON TABLE worker_reflections IS 'Structured self-assessment from sentinel workers after each assignment.';

CREATE INDEX IF NOT EXISTS idx_prospects_held
  ON recruitment_prospects (status, created_at ASC) WHERE status = 'held';
CREATE INDEX IF NOT EXISTS idx_prospects_rescue
  ON recruitment_prospects (status, research_score DESC NULLS LAST) WHERE status IN ('rejected', 'held');


-- 5b. Recruitment chat logs (with prospect_id from the start)
CREATE TABLE IF NOT EXISTS public.recruitment_chat_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  client_ip text,
  prospect_id uuid,
  user_message text NOT NULL,
  assistant_message text NOT NULL,
  flagged boolean NOT NULL DEFAULT false,
  flag_reason text,
  latency_ms integer,
  token_count integer,
  reviewed_by text,
  review_score integer,
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- If table existed without prospect_id, add it
ALTER TABLE recruitment_chat_logs ADD COLUMN IF NOT EXISTS prospect_id uuid;

COMMENT ON COLUMN recruitment_chat_logs.session_id IS 'Groups messages in the same conversation';
COMMENT ON COLUMN recruitment_chat_logs.prospect_id IS 'Links chat exchange to a recruitment_prospects record (set via ?pid= from email CTA)';

CREATE INDEX IF NOT EXISTS idx_chat_logs_review_queue
  ON recruitment_chat_logs (flagged DESC, reviewed_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_logs_session
  ON recruitment_chat_logs (session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_logs_created
  ON recruitment_chat_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_logs_prospect
  ON recruitment_chat_logs (prospect_id, created_at DESC) WHERE prospect_id IS NOT NULL;

ALTER TABLE public.recruitment_chat_logs ENABLE ROW LEVEL SECURITY;

-- Index for reply-stage prospects
CREATE INDEX IF NOT EXISTS idx_prospects_replied
  ON recruitment_prospects (updated_at DESC) WHERE interaction_stage = 'replied';


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PHASE 5: Plan matching — carrier stack cache & recommendations │
-- └─────────────────────────────────────────────────────────────────┘

-- 5a. carrier_agents — licensed agents who can sell
CREATE TABLE IF NOT EXISTS carrier_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name TEXT NOT NULL,
  agent_email TEXT,
  licensed_states TEXT[] NOT NULL DEFAULT '{}',
  upline_agent_id UUID REFERENCES carrier_agents(id),
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_carrier_agents_active
  ON carrier_agents (active) WHERE active = true;

ALTER TABLE carrier_agents
  ADD CONSTRAINT carrier_agents_email_unique UNIQUE (agent_email);

-- 5b. carrier_products — the plan cache
CREATE TABLE IF NOT EXISTS carrier_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES carrier_agents(id),
  carrier_name TEXT NOT NULL,
  carrier_code TEXT,
  plan_name TEXT NOT NULL,
  plan_type TEXT NOT NULL,
  min_issue_age INTEGER DEFAULT 0,
  max_issue_age INTEGER DEFAULT 85,
  available_states TEXT[] NOT NULL DEFAULT '{}',
  underwriting_type TEXT NOT NULL DEFAULT 'full',
  medical_exam_required BOOLEAN NOT NULL DEFAULT false,
  min_face_amount NUMERIC,
  max_face_amount NUMERIC,
  key_features TEXT[] NOT NULL DEFAULT '{}',
  ideal_customer TEXT,
  competitive_edge TEXT,
  commission_notes TEXT,
  plan_status TEXT NOT NULL DEFAULT 'active',
  effective_date DATE,
  discontinuation_date DATE,
  metadata JSONB DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_carrier_products_active ON carrier_products (plan_status) WHERE plan_status = 'active';
CREATE INDEX IF NOT EXISTS idx_carrier_products_type ON carrier_products (plan_type);
CREATE INDEX IF NOT EXISTS idx_carrier_products_agent ON carrier_products (agent_id);
CREATE INDEX IF NOT EXISTS idx_carrier_products_states ON carrier_products USING gin (available_states);

-- 5c. plan_recommendations — agent-facing match results
CREATE TABLE IF NOT EXISTS plan_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID REFERENCES recruitment_prospects(id),
  lead_source TEXT NOT NULL DEFAULT 'recruitment',
  lead_data JSONB DEFAULT '{}'::jsonb,
  assigned_agent_id UUID REFERENCES carrier_agents(id),
  matched_plans JSONB NOT NULL DEFAULT '[]'::jsonb,
  match_summary TEXT,
  agent_notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending_review',
  reviewed_at TIMESTAMPTZ,
  matched_by TEXT DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plan_recs_prospect ON plan_recommendations (prospect_id) WHERE prospect_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_plan_recs_status ON plan_recommendations (status);
CREATE INDEX IF NOT EXISTS idx_plan_recs_agent ON plan_recommendations (assigned_agent_id) WHERE assigned_agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_plan_recs_source ON plan_recommendations (lead_source);

-- 5d. Seed Tim & Beth
INSERT INTO carrier_agents (agent_name, agent_email, licensed_states, notes)
VALUES
  ('Tim Byrd', 'tim@legacyf-l.com', ARRAY['GA','OH','OK','SC','MS','MI','TX','UT','AL','LA'], 'Co-founder, Legacy Financial & Life'),
  ('Beth Byrd', 'beth@legacyf-l.com', ARRAY['GA','OH','OK','SC','MS','MI','TX','UT','AL','LA'], 'Co-founder, Legacy Financial & Life')
ON CONFLICT (agent_email) DO UPDATE SET licensed_states = EXCLUDED.licensed_states, updated_at = now();

-- 5e. Helper: find products matching a lead profile
CREATE OR REPLACE FUNCTION match_products_for_lead(
  p_state TEXT, p_age INTEGER DEFAULT NULL, p_plan_types TEXT[] DEFAULT NULL, p_agent_id UUID DEFAULT NULL
) RETURNS TABLE (
  product_id UUID, agent_id UUID, agent_name TEXT, carrier_name TEXT, plan_name TEXT,
  plan_type TEXT, underwriting_type TEXT, key_features TEXT[], ideal_customer TEXT, competitive_edge TEXT
) LANGUAGE sql STABLE AS $$
  SELECT cp.id, cp.agent_id, ca.agent_name, cp.carrier_name, cp.plan_name, cp.plan_type,
         cp.underwriting_type, cp.key_features, cp.ideal_customer, cp.competitive_edge
  FROM carrier_products cp
  JOIN carrier_agents ca ON ca.id = cp.agent_id AND ca.active = true
  WHERE cp.plan_status = 'active'
    AND p_state = ANY(cp.available_states)
    AND (p_age IS NULL OR (p_age >= cp.min_issue_age AND p_age <= cp.max_issue_age))
    AND (p_plan_types IS NULL OR cp.plan_type = ANY(p_plan_types))
    AND (p_agent_id IS NULL OR cp.agent_id = p_agent_id)
  ORDER BY cp.plan_type, cp.carrier_name;
$$;


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ PHASE 6: Sales leads pool — consumer leads for plan matching   │
-- └─────────────────────────────────────────────────────────────────┘

-- 6a. sales_leads — the consumer lead pool
CREATE TABLE IF NOT EXISTS sales_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  state TEXT,
  date_of_birth DATE,
  age INTEGER,
  height_inches INTEGER,
  weight_lbs INTEGER,
  tobacco_use BOOLEAN DEFAULT false,
  interest TEXT,
  beneficiary_name TEXT,
  coverage_amount NUMERIC,
  source TEXT NOT NULL DEFAULT 'free_quote',
  tracking_id TEXT,
  campaign_id UUID,
  attribution JSONB DEFAULT '{}'::jsonb,
  lead_score INTEGER,
  lead_tier TEXT,
  score_signals JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'new',
  assigned_agent_id UUID REFERENCES carrier_agents(id),
  agent_notes TEXT,
  contacted_at TIMESTAMPTZ,
  quoted_at TIMESTAMPTZ,
  bound_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_leads_status ON sales_leads (status);
CREATE INDEX IF NOT EXISTS idx_sales_leads_new ON sales_leads (created_at DESC) WHERE status = 'new';
CREATE INDEX IF NOT EXISTS idx_sales_leads_state ON sales_leads (state);
CREATE INDEX IF NOT EXISTS idx_sales_leads_source ON sales_leads (source);
CREATE INDEX IF NOT EXISTS idx_sales_leads_tracking ON sales_leads (tracking_id) WHERE tracking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_leads_email ON sales_leads (email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_leads_agent ON sales_leads (assigned_agent_id) WHERE assigned_agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_leads_score ON sales_leads (lead_score DESC NULLS LAST);

-- 6b. Link plan_recommendations to sales_leads
ALTER TABLE plan_recommendations
  ADD COLUMN IF NOT EXISTS sales_lead_id UUID REFERENCES sales_leads(id);
CREATE INDEX IF NOT EXISTS idx_plan_recs_sales_lead
  ON plan_recommendations (sales_lead_id) WHERE sales_lead_id IS NOT NULL;

-- 6c. Auto-compute age from DOB
CREATE OR REPLACE FUNCTION compute_age_from_dob()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.date_of_birth IS NOT NULL THEN
    NEW.age := EXTRACT(YEAR FROM age(NEW.date_of_birth));
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sales_leads_compute_age') THEN
    CREATE TRIGGER trg_sales_leads_compute_age
      BEFORE INSERT OR UPDATE OF date_of_birth ON sales_leads
      FOR EACH ROW EXECUTE FUNCTION compute_age_from_dob();
  END IF;
END $$;
