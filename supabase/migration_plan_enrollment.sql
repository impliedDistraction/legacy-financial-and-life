-- Plan Recommendation & Enrollment System
-- Tracks: quote sessions → plan selections → agent approval → enrollment
-- Designed for ACA Marketplace (under-65) and Medicare (T65) pathways
--
-- Compliance: Human-in-loop required for all enrollments.
-- Digital signatures captured and timestamped for consent verification.

-- ════════════════════════════════════════════════════════════════════════
-- QUOTE SESSIONS — tracks a consumer's plan shopping journey
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.quote_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Consumer info
  consumer_name TEXT NOT NULL,
  consumer_email TEXT,
  consumer_phone TEXT,
  consumer_dob DATE,
  consumer_age INT,
  zip_code TEXT NOT NULL,
  state_code TEXT NOT NULL,
  county_fips TEXT NOT NULL,
  -- Household & financial
  household_size INT DEFAULT 1,
  annual_income NUMERIC,
  tobacco_use BOOLEAN DEFAULT false,
  -- Pathway
  pathway TEXT NOT NULL DEFAULT 'marketplace', -- 'marketplace' | 'medicare'
  -- Prescriptions (future use)
  prescriptions JSONB DEFAULT '[]'::jsonb,
  -- Results snapshot
  plans_shown INT DEFAULT 0,
  subsidy_estimate JSONB, -- { aptcMonthly, fplPercent, applicablePct, ... }
  -- Status
  status TEXT NOT NULL DEFAULT 'quoted',
  -- 'quoted' → 'plan_selected' → 'pending_approval' → 'approved' → 'enrolled'
  -- Also: 'declined', 'expired', 'agent_flagged'
  -- Attribution
  tracking_id TEXT,
  source TEXT, -- 'free-quote', 'survey', 'direct'
  campaign_key TEXT,
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '30 days')
);

CREATE INDEX IF NOT EXISTS quote_sessions_email_idx ON public.quote_sessions (consumer_email);
CREATE INDEX IF NOT EXISTS quote_sessions_status_idx ON public.quote_sessions (status, created_at DESC);
CREATE INDEX IF NOT EXISTS quote_sessions_pathway_idx ON public.quote_sessions (pathway, status);

-- ════════════════════════════════════════════════════════════════════════
-- PLAN SELECTIONS — consumer picks a plan from their quote results
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.plan_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.quote_sessions(id) ON DELETE CASCADE,
  -- Plan details (snapshot at time of selection)
  plan_id TEXT NOT NULL, -- CMS StandardComponentId
  plan_name TEXT NOT NULL,
  issuer_name TEXT NOT NULL,
  metal_level TEXT,
  plan_type TEXT,
  monthly_premium NUMERIC,
  estimated_net_premium NUMERIC, -- after subsidy
  deductible TEXT,
  max_out_of_pocket TEXT,
  -- Selection status
  status TEXT NOT NULL DEFAULT 'selected',
  -- 'selected' → 'pending_approval' → 'approved' → 'enrolled' | 'declined'
  selected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Agent review
  reviewed_by TEXT, -- agent email/name
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS plan_selections_session_idx ON public.plan_selections (session_id);
CREATE INDEX IF NOT EXISTS plan_selections_status_idx ON public.plan_selections (status);

-- ════════════════════════════════════════════════════════════════════════
-- DIGITAL SIGNATURES — cryptographically verifiable consent records
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.enrollment_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.quote_sessions(id) ON DELETE CASCADE,
  selection_id UUID NOT NULL REFERENCES public.plan_selections(id) ON DELETE CASCADE,
  -- Signer info
  signer_name TEXT NOT NULL,
  signer_email TEXT NOT NULL,
  signer_ip TEXT,
  -- Signature payload
  consent_text TEXT NOT NULL, -- The exact text they agreed to
  signature_data TEXT NOT NULL, -- Canvas signature (base64 PNG) or typed name
  signature_type TEXT NOT NULL DEFAULT 'typed', -- 'typed' | 'drawn' | 'click'
  -- Verification
  consent_hash TEXT NOT NULL, -- SHA-256 of (consent_text + signer_email + timestamp)
  -- Timestamps
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Metadata
  user_agent TEXT,
  properties JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS enrollment_signatures_session_idx ON public.enrollment_signatures (session_id);
CREATE INDEX IF NOT EXISTS enrollment_signatures_selection_idx ON public.enrollment_signatures (selection_id);

-- ════════════════════════════════════════════════════════════════════════
-- ENROLLMENT EVENTS — audit trail for the entire flow
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.enrollment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.quote_sessions(id) ON DELETE CASCADE,
  selection_id UUID REFERENCES public.plan_selections(id) ON DELETE SET NULL,
  -- Event
  event_type TEXT NOT NULL,
  -- 'quote_generated', 'plan_selected', 'signature_captured',
  -- 'submitted_for_review', 'agent_approved', 'agent_declined',
  -- 'agent_flagged', 'enrollment_submitted', 'enrollment_confirmed',
  -- 'email_sent', 'consumer_notified', 'expired'
  event_data JSONB DEFAULT '{}'::jsonb,
  actor TEXT, -- 'system', 'consumer', agent email
  -- Timestamps
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS enrollment_events_session_idx ON public.enrollment_events (session_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS enrollment_events_type_idx ON public.enrollment_events (event_type, occurred_at DESC);

-- ════════════════════════════════════════════════════════════════════════
-- RLS Policies
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE public.quote_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollment_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollment_events ENABLE ROW LEVEL SECURITY;

-- Service role only (API endpoints handle all access)
CREATE POLICY "service_role_all" ON public.quote_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.plan_selections FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.enrollment_signatures FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.enrollment_events FOR ALL USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════════════
-- Updated-at trigger
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_quote_sessions_updated_at
  BEFORE UPDATE ON public.quote_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
