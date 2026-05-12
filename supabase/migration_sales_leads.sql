-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION: Sales leads pool — consumer leads for agent plan matching
-- Run in Supabase SQL Editor (Legacy Financial: kxmojndpgxgbykxjtxba)
-- Safe to re-run — all statements use IF NOT EXISTS.
--
-- This creates the consumer leads pool that parallels recruitment_prospects
-- but for SALES leads (people who need insurance, not agents being recruited).
--
-- Sources: /free-quote form, Facebook leads, future lead gen campaigns
-- Consumers: Tim, Beth, Clint, recruited agents — via plan_recommendations
-- ═══════════════════════════════════════════════════════════════════


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 1. sales_leads — the consumer lead pool                        │
-- └─────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS sales_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Consumer identity
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  state TEXT,
  date_of_birth DATE,
  age INTEGER,                                    -- computed from DOB at insert

  -- Health/underwriting signals (from free-quote form)
  height_inches INTEGER,                          -- total inches (5'10" = 70)
  weight_lbs INTEGER,
  tobacco_use BOOLEAN DEFAULT false,

  -- Coverage intent
  interest TEXT,                                   -- whole-life, final-expense, wealth, not-sure
  beneficiary_name TEXT,
  coverage_amount NUMERIC,                         -- desired face amount (if known)

  -- Source tracking
  source TEXT NOT NULL DEFAULT 'free_quote',        -- free_quote, facebook, referral, walk_in, campaign
  tracking_id TEXT,                                 -- links to lead_flow_events
  campaign_id UUID,                                 -- future: campaign FK
  attribution JSONB DEFAULT '{}'::jsonb,            -- UTM, referrer, click IDs

  -- Lead quality
  lead_score INTEGER,                              -- 0-100 from lead-scoring.ts
  lead_tier TEXT,                                   -- hot, warm, cold
  score_signals JSONB DEFAULT '[]'::jsonb,          -- detailed scoring breakdown

  -- Pipeline status
  status TEXT NOT NULL DEFAULT 'new',               -- new, matched, assigned, contacted, quoted, bound, lost, disqualified
  assigned_agent_id UUID REFERENCES carrier_agents(id),
  agent_notes TEXT,

  -- Timestamps
  contacted_at TIMESTAMPTZ,
  quoted_at TIMESTAMPTZ,
  bound_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_sales_leads_status
  ON sales_leads (status);

CREATE INDEX IF NOT EXISTS idx_sales_leads_new
  ON sales_leads (created_at DESC) WHERE status = 'new';

CREATE INDEX IF NOT EXISTS idx_sales_leads_state
  ON sales_leads (state);

CREATE INDEX IF NOT EXISTS idx_sales_leads_source
  ON sales_leads (source);

CREATE INDEX IF NOT EXISTS idx_sales_leads_tracking
  ON sales_leads (tracking_id) WHERE tracking_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_leads_email
  ON sales_leads (email) WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_leads_agent
  ON sales_leads (assigned_agent_id) WHERE assigned_agent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_leads_score
  ON sales_leads (lead_score DESC NULLS LAST);


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 2. Update plan_recommendations to reference sales_leads        │
-- └─────────────────────────────────────────────────────────────────┘

-- Add sales_lead_id FK (nullable — a recommendation can come from either pool)
ALTER TABLE plan_recommendations
  ADD COLUMN IF NOT EXISTS sales_lead_id UUID REFERENCES sales_leads(id);

CREATE INDEX IF NOT EXISTS idx_plan_recs_sales_lead
  ON plan_recommendations (sales_lead_id) WHERE sales_lead_id IS NOT NULL;


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 3. Helper: compute age from DOB                                │
-- └─────────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION compute_age_from_dob()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.date_of_birth IS NOT NULL THEN
    NEW.age := EXTRACT(YEAR FROM age(NEW.date_of_birth));
  END IF;
  RETURN NEW;
END;
$$;

-- Only create trigger if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sales_leads_compute_age'
  ) THEN
    CREATE TRIGGER trg_sales_leads_compute_age
      BEFORE INSERT OR UPDATE OF date_of_birth ON sales_leads
      FOR EACH ROW EXECUTE FUNCTION compute_age_from_dob();
  END IF;
END $$;
