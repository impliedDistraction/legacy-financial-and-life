-- ═══════════════════════════════════════════════════════════════════
-- T65 CLIENT LIFECYCLE — Medicare transition client management
-- Run in Supabase SQL Editor (Legacy Financial: kxmojndpgxgbykxjtxba)
-- Safe to re-run — all statements use IF NOT EXISTS.
--
-- Tracks clients from pre-retirement through Medicare enrollment and
-- ongoing annual plan reviews. Supports chatbot-guided intake,
-- retirement date triggers, periodic check-ins, and Beth's review.
-- ═══════════════════════════════════════════════════════════════════


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 1. t65_clients — the client profile                            │
-- └─────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS t65_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  date_of_birth DATE,
  age INTEGER,

  -- Location (drives state-specific Medicare guidance)
  zip_code TEXT,
  state_code TEXT,
  county_fips TEXT,
  county_name TEXT,

  -- Personal context
  marital_status TEXT,             -- single, married, divorced, widowed
  spouse_name TEXT,
  spouse_dob DATE,
  spouse_has_medicare BOOLEAN,     -- relevant for secondary coverage timing

  -- Career & retirement
  employment_status TEXT,          -- employed, self_employed, retired, disabled
  employer_name TEXT,
  employer_size TEXT,              -- <20, 20+, unknown (affects primary/secondary payer rules)
  has_employer_coverage BOOLEAN,   -- current employer health plan
  planned_retirement_date DATE,    -- THE key trigger date
  actual_retirement_date DATE,     -- when they actually retired (if different)
  retirement_triggered BOOLEAN DEFAULT false,  -- has automation fired?

  -- Medicare status
  medicare_status TEXT NOT NULL DEFAULT 'pre_enrollment',
  -- pre_enrollment → iep_approaching → iep_active → enrolled → annual_review
  medicare_part_a BOOLEAN DEFAULT false,
  medicare_part_a_date DATE,
  medicare_part_b BOOLEAN DEFAULT false,
  medicare_part_b_date DATE,
  medicare_part_c TEXT,            -- plan name if MA enrolled
  medicare_part_d TEXT,            -- plan name if standalone PDP

  -- Current coverage (what they have NOW)
  current_coverage_type TEXT,      -- employer, cobra, marketplace, spouse, va, tricare, medicaid, none
  current_coverage_carrier TEXT,
  current_coverage_end_date DATE,  -- when it ends (triggers COBRA/marketplace window)

  -- Health & medications
  prescriptions JSONB DEFAULT '[]'::jsonb,  -- [{name, dosage, rxcui}]
  health_conditions JSONB DEFAULT '[]'::jsonb,  -- general health flags
  preferred_doctors JSONB DEFAULT '[]'::jsonb,  -- [{name, npi, specialty}]
  tobacco_use BOOLEAN DEFAULT false,

  -- Budget & preferences
  monthly_budget_max NUMERIC,
  priority TEXT,                   -- low_premium, low_deductible, comprehensive, prescription_coverage
  prefers_original_medicare BOOLEAN,  -- vs. Medicare Advantage
  needs_dental_vision BOOLEAN,
  travels_frequently BOOLEAN,      -- affects MA vs Original+Medigap choice

  -- Strategy & recommendations
  recommended_strategy TEXT,       -- text summary from Beth/AI
  strategy_notes TEXT,
  medigap_plan_letter TEXT,        -- A, B, C, D, F, G, K, L, M, N (if applicable)

  -- Engagement
  source TEXT DEFAULT 'chatbot',   -- chatbot, referral, website, phone, walk_in
  assigned_agent TEXT DEFAULT 'beth',
  last_interaction_at TIMESTAMPTZ,
  next_checkin_date DATE,
  checkin_frequency TEXT DEFAULT 'quarterly',  -- monthly, quarterly, semi_annual, annual

  -- Access
  dashboard_token TEXT UNIQUE,     -- HMAC-signed token for client portal access
  dashboard_last_accessed TIMESTAMPTZ,

  -- Pipeline
  status TEXT NOT NULL DEFAULT 'intake',
  -- intake → strategy_building → awaiting_iep → enrollment_ready → enrolled → active_client → annual_review
  consent_given BOOLEAN DEFAULT false,
  consent_given_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_t65_clients_status ON t65_clients (status);
CREATE INDEX IF NOT EXISTS idx_t65_clients_retirement_date
  ON t65_clients (planned_retirement_date) WHERE planned_retirement_date IS NOT NULL AND retirement_triggered = false;
CREATE INDEX IF NOT EXISTS idx_t65_clients_next_checkin
  ON t65_clients (next_checkin_date) WHERE next_checkin_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_t65_clients_email ON t65_clients (email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_t65_clients_dashboard_token
  ON t65_clients (dashboard_token) WHERE dashboard_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_t65_clients_medicare_status ON t65_clients (medicare_status);

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 2. t65_interactions — conversation & touchpoint history         │
-- └─────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS t65_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES t65_clients(id) ON DELETE CASCADE,

  -- What happened
  interaction_type TEXT NOT NULL,
  -- chatbot_session, phone_call, email, plan_review, checkin, enrollment_assist, document_upload
  channel TEXT,                    -- web, sms, email, phone, in_person
  summary TEXT,                    -- brief description or AI summary
  details JSONB DEFAULT '{}'::jsonb,  -- full payload (chat transcript, notes, etc.)

  -- Attribution
  initiated_by TEXT,               -- client, bot, agent, system
  agent TEXT,                      -- who handled it (beth, tim, ai)

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_t65_interactions_client ON t65_interactions (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_t65_interactions_type ON t65_interactions (interaction_type);

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 3. t65_plan_reviews — annual/periodic plan review snapshots     │
-- └─────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS t65_plan_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES t65_clients(id) ON DELETE CASCADE,

  -- Review period
  review_year INTEGER NOT NULL,        -- e.g. 2026, 2027
  review_type TEXT NOT NULL DEFAULT 'annual',  -- annual, initial, life_change, medication_change

  -- Current coverage at review time
  current_plan_type TEXT,              -- original_medicare, ma, pdp, medigap
  current_plan_name TEXT,
  current_monthly_cost NUMERIC,

  -- Recommended changes
  recommendation TEXT,                 -- stay, switch, add, drop
  recommended_plan TEXT,
  recommended_monthly_cost NUMERIC,
  savings_estimate NUMERIC,

  -- Drug coverage analysis
  drug_coverage_analysis JSONB,        -- per-drug tier/copay breakdown
  coverage_gaps JSONB,                 -- drugs not covered or tier 4/5

  -- Status
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, presented, accepted, declined
  presented_at TIMESTAMPTZ,
  client_decision TEXT,
  client_decision_at TIMESTAMPTZ,
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_t65_plan_reviews_client ON t65_plan_reviews (client_id, review_year DESC);

-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 4. RLS — service_role only (no anon access)                    │
-- └─────────────────────────────────────────────────────────────────┘

ALTER TABLE t65_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE t65_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE t65_plan_reviews ENABLE ROW LEVEL SECURITY;

-- service_role bypasses RLS; no policies needed for anon
-- If client portal access is added later, add policies using dashboard_token verification
