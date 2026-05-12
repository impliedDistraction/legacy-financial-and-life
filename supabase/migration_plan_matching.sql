-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION: Plan Matching — Carrier stack cache & agent recommendations
-- Run in Supabase SQL Editor (Legacy Financial: kxmojndpgxgbykxjtxba)
-- Safe to re-run — all statements use IF NOT EXISTS.
--
-- Three tables:
--   carrier_agents     — licensed agents who can sell (Tim, Beth, future recruits)
--   carrier_products   — active plans in the carrier stack
--   plan_recommendations — agent-facing match results (never consumer-facing)
-- ═══════════════════════════════════════════════════════════════════


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 1. carrier_agents — who can sell                               │
-- └─────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS carrier_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name TEXT NOT NULL,
  agent_email TEXT,
  licensed_states TEXT[] NOT NULL DEFAULT '{}',
  -- upline reference (NULL = top-level, i.e. Tim & Beth)
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


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 2. carrier_products — the plan cache                           │
-- └─────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS carrier_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- which agent(s) can write this product
  agent_id UUID NOT NULL REFERENCES carrier_agents(id),
  carrier_name TEXT NOT NULL,
  carrier_code TEXT,                           -- shorthand (e.g. MOO, AMNAT, NGL)
  plan_name TEXT NOT NULL,
  plan_type TEXT NOT NULL,                     -- term, whole_life, iul, final_expense, annuity
  -- eligibility windows
  min_issue_age INTEGER DEFAULT 0,
  max_issue_age INTEGER DEFAULT 85,
  available_states TEXT[] NOT NULL DEFAULT '{}', -- states this product is filed in
  -- underwriting
  underwriting_type TEXT NOT NULL DEFAULT 'full',  -- full, simplified, guaranteed
  medical_exam_required BOOLEAN NOT NULL DEFAULT false,
  -- coverage
  min_face_amount NUMERIC,                     -- minimum death benefit
  max_face_amount NUMERIC,                     -- maximum death benefit
  -- selling points (agent-facing)
  key_features TEXT[] NOT NULL DEFAULT '{}',
  ideal_customer TEXT,                         -- who this plan fits best
  competitive_edge TEXT,                       -- what makes it stand out vs competitors
  commission_notes TEXT,                       -- internal: comp structure hints
  -- lifecycle
  plan_status TEXT NOT NULL DEFAULT 'active',  -- active, discontinued, coming_soon
  effective_date DATE,
  discontinuation_date DATE,
  -- flexible carrier-specific data
  metadata JSONB DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_carrier_products_active
  ON carrier_products (plan_status) WHERE plan_status = 'active';

CREATE INDEX IF NOT EXISTS idx_carrier_products_type
  ON carrier_products (plan_type);

CREATE INDEX IF NOT EXISTS idx_carrier_products_agent
  ON carrier_products (agent_id);

-- GIN index for state availability lookups
CREATE INDEX IF NOT EXISTS idx_carrier_products_states
  ON carrier_products USING gin (available_states);


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 3. plan_recommendations — agent-facing match results           │
-- └─────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS plan_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- link to a recruitment prospect (nullable for direct sales leads)
  prospect_id UUID REFERENCES recruitment_prospects(id),
  -- for non-recruitment leads (e.g. /free-quote submissions)
  lead_source TEXT NOT NULL DEFAULT 'recruitment',  -- recruitment, free_quote, referral, walk_in
  lead_data JSONB DEFAULT '{}'::jsonb,              -- name, age, state, coverage needs, health info
  -- which agent should work this
  assigned_agent_id UUID REFERENCES carrier_agents(id),
  -- match results (ordered by fit score)
  matched_plans JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- AI-generated agent-facing summary
  match_summary TEXT,
  -- agent workflow
  agent_notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending_review',    -- pending_review, agent_reviewed, contacted, quoted, bound, lost
  reviewed_at TIMESTAMPTZ,
  -- metadata
  matched_by TEXT DEFAULT 'system',                 -- system or agent name
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plan_recs_prospect
  ON plan_recommendations (prospect_id) WHERE prospect_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_plan_recs_status
  ON plan_recommendations (status);

CREATE INDEX IF NOT EXISTS idx_plan_recs_agent
  ON plan_recommendations (assigned_agent_id) WHERE assigned_agent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_plan_recs_source
  ON plan_recommendations (lead_source);


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 4. Seed Tim & Beth as carrier agents                           │
-- └─────────────────────────────────────────────────────────────────┘

INSERT INTO carrier_agents (agent_name, agent_email, licensed_states, notes)
VALUES
  (
    'Tim Byrd',
    'tim@legacyf-l.com',
    ARRAY['GA','OH','OK','SC','MS','MI','TX','UT','AL','LA'],
    'Co-founder, Legacy Financial & Life'
  ),
  (
    'Beth Byrd',
    'beth@legacyf-l.com',
    ARRAY['GA','OH','OK','SC','MS','MI','TX','UT','AL','LA'],
    'Co-founder, Legacy Financial & Life'
  )
ON CONFLICT (agent_email) DO UPDATE SET
  licensed_states = EXCLUDED.licensed_states,
  updated_at = now();


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 5. Helper: find products matching a lead profile               │
-- └─────────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION match_products_for_lead(
  p_state TEXT,
  p_age INTEGER DEFAULT NULL,
  p_plan_types TEXT[] DEFAULT NULL,
  p_agent_id UUID DEFAULT NULL
)
RETURNS TABLE (
  product_id UUID,
  agent_id UUID,
  agent_name TEXT,
  carrier_name TEXT,
  plan_name TEXT,
  plan_type TEXT,
  underwriting_type TEXT,
  key_features TEXT[],
  ideal_customer TEXT,
  competitive_edge TEXT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    cp.id AS product_id,
    cp.agent_id,
    ca.agent_name,
    cp.carrier_name,
    cp.plan_name,
    cp.plan_type,
    cp.underwriting_type,
    cp.key_features,
    cp.ideal_customer,
    cp.competitive_edge
  FROM carrier_products cp
  JOIN carrier_agents ca ON ca.id = cp.agent_id AND ca.active = true
  WHERE cp.plan_status = 'active'
    AND p_state = ANY(cp.available_states)
    AND (p_age IS NULL OR (p_age >= cp.min_issue_age AND p_age <= cp.max_issue_age))
    AND (p_plan_types IS NULL OR cp.plan_type = ANY(p_plan_types))
    AND (p_agent_id IS NULL OR cp.agent_id = p_agent_id)
  ORDER BY cp.plan_type, cp.carrier_name;
$$;
