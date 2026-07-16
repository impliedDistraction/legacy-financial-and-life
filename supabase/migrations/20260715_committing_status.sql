-- ═══════════════════════════════════════════════════════════════════
-- Committing Status Support
-- Run in Legacy Financial Supabase (kxmojndpgxgbykxjtxba)
-- Safe to re-run
--
-- Adds columns to track team affiliation from the recruitment side.
-- When a prospect's meeting outcome is "committed", they transition to
-- status='committing' and we record which recruiter's team they're joining.
-- ═══════════════════════════════════════════════════════════════════

-- Track which recruiter sourced this prospect and team relationship
ALTER TABLE recruitment_prospects
  ADD COLUMN IF NOT EXISTS recruited_by_slug TEXT,         -- recruiter's showcase slug (e.g. 'lucky-austin-atlanta')
  ADD COLUMN IF NOT EXISTS team_membership_id UUID,        -- wo_agent_teams.id on Fieldwork Systems Supabase
  ADD COLUMN IF NOT EXISTS committed_at TIMESTAMPTZ;       -- when they said yes in meeting

-- Index for finding all team members of a recruiter
CREATE INDEX IF NOT EXISTS idx_prospects_recruited_by
  ON recruitment_prospects (recruited_by_slug)
  WHERE recruited_by_slug IS NOT NULL AND status IN ('committing', 'converted');

-- Document the expanded status values
COMMENT ON COLUMN recruitment_prospects.status IS
  'Lifecycle: pending → drafted → reviewed → approved → sent → follow_up_1 → follow_up_2 → follow_up_exhausted → scheduled → committing → converted | rejected | opted_out';
