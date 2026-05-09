-- Migration: Worker Reflections — structured self-assessment from every worker
--
-- Each worker records what it did, how confident it is, what limited
-- the quality of its output, and what data would have improved the result.
-- This creates a feedback signal we can aggregate to target improvements
-- (especially in candidate research).
--
-- Run this in Supabase SQL Editor (Legacy Financial project)

-- ═══════════════════════════════════════════
-- 1. Worker reflections table
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS worker_reflections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Which worker produced this reflection
  worker TEXT NOT NULL,  -- lead-researcher | recruitment | qa-agent | review-agent | prophog

  -- What was the assignment
  assignment_type TEXT NOT NULL,  -- research | draft | qa_check | review | scan

  -- Link to the prospect (nullable for non-prospect work)
  prospect_id UUID REFERENCES recruitment_prospects(id) ON DELETE SET NULL,
  campaign_id UUID,

  -- Self-assessment
  confidence SMALLINT NOT NULL CHECK (confidence BETWEEN 1 AND 10),
  outcome_summary TEXT NOT NULL,

  -- Structured signals about what limited quality
  -- Categories: insufficient_web_presence, no_email, no_phone,
  --   generic_profile, ambiguous_name, no_research_data, stale_data,
  --   missing_location, low_search_results, compliance_concerns,
  --   api_error, model_uncertainty, weak_personalization,
  --   missing_trait_data, low_fit_confidence
  limiting_factors TEXT[] NOT NULL DEFAULT '{}',

  -- Free-form: what would have made this response better?
  improvement_notes TEXT,

  -- Structured gaps: { "missing_fields": [...], "weak_signals": [...], "suggested_sources": [...] }
  data_gaps JSONB DEFAULT '{}',

  -- Surfaceable flags: needs_manual_review, unusual_pattern, high_value_prospect, compliance_risk
  flags TEXT[] NOT NULL DEFAULT '{}',

  -- Worker-specific metadata (scores, timings, anything relevant)
  properties JSONB DEFAULT '{}'
);

-- ═══════════════════════════════════════════
-- 2. Indexes for common query patterns
-- ═══════════════════════════════════════════

-- Find reflections for a specific prospect
CREATE INDEX IF NOT EXISTS idx_reflections_prospect
  ON worker_reflections (prospect_id)
  WHERE prospect_id IS NOT NULL;

-- Aggregate by worker type
CREATE INDEX IF NOT EXISTS idx_reflections_worker
  ON worker_reflections (worker, created_at DESC);

-- Find low-confidence work that needs attention
CREATE INDEX IF NOT EXISTS idx_reflections_low_confidence
  ON worker_reflections (confidence, created_at DESC)
  WHERE confidence <= 4;

-- Find flagged reflections
CREATE INDEX IF NOT EXISTS idx_reflections_flagged
  ON worker_reflections USING gin (flags)
  WHERE array_length(flags, 1) > 0;

-- ═══════════════════════════════════════════
-- 3. Aggregation: top limiting factors by worker
-- ═══════════════════════════════════════════
CREATE OR REPLACE FUNCTION reflection_limiting_factors(
  p_worker TEXT DEFAULT NULL,
  p_since TIMESTAMPTZ DEFAULT now() - INTERVAL '7 days'
)
RETURNS TABLE (factor TEXT, occurrences BIGINT, avg_confidence NUMERIC, worker_name TEXT)
LANGUAGE sql STABLE
AS $$
  SELECT
    unnest(limiting_factors) AS factor,
    count(*) AS occurrences,
    round(avg(confidence), 1) AS avg_confidence,
    worker AS worker_name
  FROM worker_reflections
  WHERE created_at >= p_since
    AND (p_worker IS NULL OR worker = p_worker)
  GROUP BY unnest(limiting_factors), worker
  ORDER BY occurrences DESC;
$$;

-- ═══════════════════════════════════════════
-- 4. Aggregation: confidence trends by worker
-- ═══════════════════════════════════════════
CREATE OR REPLACE FUNCTION reflection_confidence_trend(
  p_worker TEXT DEFAULT NULL,
  p_since TIMESTAMPTZ DEFAULT now() - INTERVAL '30 days'
)
RETURNS TABLE (day DATE, worker_name TEXT, avg_confidence NUMERIC, reflection_count BIGINT)
LANGUAGE sql STABLE
AS $$
  SELECT
    created_at::date AS day,
    worker AS worker_name,
    round(avg(confidence), 1) AS avg_confidence,
    count(*) AS reflection_count
  FROM worker_reflections
  WHERE created_at >= p_since
    AND (p_worker IS NULL OR worker = p_worker)
  GROUP BY created_at::date, worker
  ORDER BY day DESC;
$$;

-- ═══════════════════════════════════════════
-- 5. Prospect reflection history (all worker
--    assessments for a single prospect)
-- ═══════════════════════════════════════════
CREATE OR REPLACE FUNCTION prospect_reflection_history(p_prospect_id UUID)
RETURNS TABLE (
  worker TEXT,
  assignment_type TEXT,
  confidence SMALLINT,
  outcome_summary TEXT,
  limiting_factors TEXT[],
  improvement_notes TEXT,
  flags TEXT[],
  created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE
AS $$
  SELECT
    worker, assignment_type, confidence, outcome_summary,
    limiting_factors, improvement_notes, flags, created_at
  FROM worker_reflections
  WHERE prospect_id = p_prospect_id
  ORDER BY created_at ASC;
$$;

COMMENT ON TABLE worker_reflections IS 'Structured self-assessment from sentinel workers after each assignment. Used to identify systemic data gaps and target improvements.';

-- ═══════════════════════════════════════════
-- 6. Index for the new 'held' status
-- ═══════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_prospects_held
  ON recruitment_prospects (status, created_at ASC)
  WHERE status = 'held';

-- ═══════════════════════════════════════════
-- 7. Index for rescue worker queries
-- ═══════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_prospects_rescue
  ON recruitment_prospects (status, research_score DESC NULLS LAST)
  WHERE status IN ('rejected', 'held');
