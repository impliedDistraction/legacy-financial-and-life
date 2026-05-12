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
-- │ PHASE 6: Lead flow analytics                                  │
-- └─────────────────────────────────────────────────────────────────┘

create extension if not exists pgcrypto;

create table if not exists public.lead_flow_events (
  id uuid primary key default gen_random_uuid(),
  tracking_id text not null,
  route text not null,
  event_name text not null,
  source text not null,
  stage text not null,
  status text not null,
  owner_scope text not null,
  lead_email text,
  lead_phone text,
  interest text,
  provider text,
  occurred_at timestamptz not null default now(),
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.lead_flow_events
  add column if not exists recipient_email text;

alter table public.lead_flow_events
  add column if not exists provider_event_at timestamptz;

comment on column public.lead_flow_events.occurred_at is
  'Time the event happened in the app or upstream provider flow.';

comment on column public.lead_flow_events.created_at is
  'Time the analytics row was inserted into Supabase.';

comment on column public.lead_flow_events.recipient_email is
  'Actual recipient for delivery-oriented events. This is separate from lead_email.';

comment on column public.lead_flow_events.provider_event_at is
  'Original upstream provider timestamp when available, such as a Resend webhook event timestamp.';

create index if not exists lead_flow_events_tracking_id_idx
  on public.lead_flow_events (tracking_id, occurred_at desc);

create index if not exists lead_flow_events_event_name_idx
  on public.lead_flow_events (event_name, occurred_at desc);

create index if not exists lead_flow_events_lead_email_idx
  on public.lead_flow_events (lead_email, occurred_at desc);

create index if not exists lead_flow_events_recipient_email_idx
  on public.lead_flow_events (recipient_email, occurred_at desc);

create index if not exists lead_flow_events_stage_idx
  on public.lead_flow_events (stage, occurred_at desc);

-- Phone-based dedup index (used by 30-day duplicate lead check)
create index if not exists lead_flow_events_lead_phone_idx
  on public.lead_flow_events (lead_phone, occurred_at desc);

-- JSONB index for IP-based rate limiting (queries properties->>'client_ip')
create index if not exists lead_flow_events_client_ip_idx
  on public.lead_flow_events ((properties->>'client_ip'), occurred_at desc)
  where event_name = 'quote_request_received';

create index if not exists lead_flow_events_campaign_key_idx
  on public.lead_flow_events ((properties->>'campaign_key'), occurred_at desc)
  where properties ? 'campaign_key';

create index if not exists lead_flow_events_utm_campaign_idx
  on public.lead_flow_events ((properties->>'utm_campaign'), occurred_at desc)
  where properties ? 'utm_campaign';

create index if not exists lead_flow_events_score_idx
  on public.lead_flow_events (((properties->>'score')::int), occurred_at desc)
  where event_name = 'quote_lead_scored' and jsonb_typeof(properties->'score') = 'number';