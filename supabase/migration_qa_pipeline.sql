-- Migration: QA Pipeline — adds quality review stage to recruitment flow
--
-- OLD FLOW: pending → processed → approved/ready_to_send → sent
-- NEW FLOW: pending → drafted → reviewed → approved → sent
--                                  ↓
--                               rejected
--
-- Run this in Supabase SQL Editor (Legacy Financial project)

-- ═══════════════════════════════════════════
-- 1. Add QA tracking columns to prospects
-- ═══════════════════════════════════════════
ALTER TABLE recruitment_prospects
  ADD COLUMN IF NOT EXISTS qa_status TEXT,
  ADD COLUMN IF NOT EXISTS qa_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS qa_rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS qa_score INTEGER,
  ADD COLUMN IF NOT EXISTS draft_version INTEGER NOT NULL DEFAULT 1;

-- QA status values: null (not checked), 'passed', 'failed'
-- qa_rejection_reason: human-readable reason for rejection
-- qa_score: 0-100 quality score from QA checks
-- draft_version: increments on re-draft after rejection

COMMENT ON COLUMN recruitment_prospects.qa_status IS 'QA check result: passed | failed | null (unchecked)';
COMMENT ON COLUMN recruitment_prospects.qa_rejection_reason IS 'Reason the QA agent rejected this draft';
COMMENT ON COLUMN recruitment_prospects.qa_score IS 'Quality score 0-100 from automated QA checks';
COMMENT ON COLUMN recruitment_prospects.draft_version IS 'Draft iteration count (increments on re-draft)';

-- ═══════════════════════════════════════════
-- 2. Index for QA agent queries
-- ═══════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_prospects_drafted
  ON recruitment_prospects (status, created_at ASC)
  WHERE status = 'drafted';

CREATE INDEX IF NOT EXISTS idx_prospects_reviewed
  ON recruitment_prospects (status, fit_score DESC NULLS LAST)
  WHERE status = 'reviewed';

-- ═══════════════════════════════════════════
-- 3. Migrate existing stuck entries
-- ═══════════════════════════════════════════

-- Move 'processed' → 'drafted' so QA agent can evaluate them
-- (these include the hundreds of old low-quality entries)
UPDATE recruitment_prospects
SET status = 'drafted',
    updated_at = now()
WHERE status = 'processed';

-- Move 'ready_to_send' → 'approved' (these were already approved, just sends locked)
UPDATE recruitment_prospects
SET status = 'approved',
    updated_at = now()
WHERE status = 'ready_to_send';

-- ═══════════════════════════════════════════
-- 4. Default require_review to true on all campaigns
-- ═══════════════════════════════════════════
UPDATE recruitment_campaigns
SET require_review = true,
    updated_at = now()
WHERE require_review = false;

-- ═══════════════════════════════════════════
-- 5. Updated counts RPC (includes new statuses)
-- ═══════════════════════════════════════════
CREATE OR REPLACE FUNCTION campaign_prospect_counts()
RETURNS TABLE (campaign_id uuid, status text, count bigint)
LANGUAGE sql STABLE
AS $$
  SELECT campaign_id, status, count(*)
  FROM recruitment_prospects
  WHERE campaign_id IS NOT NULL
  GROUP BY campaign_id, status;
$$;
