-- ═══════════════════════════════════════════════════════════════════
-- Meeting Outcomes: Post-meeting feedback and prospect status promotion
-- Run in Supabase SQL Editor (Legacy Financial: kxmojndpgxgbykxjtxba)
-- Safe to re-run — uses IF NOT EXISTS throughout
-- ═══════════════════════════════════════════════════════════════════

-- ─── Add outcome tracking columns to calendly_events ─────────────────
ALTER TABLE calendly_events
  ADD COLUMN IF NOT EXISTS outcome_requested boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS outcome_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS outcome_recorded boolean DEFAULT false;

-- Index for the worker query: find events needing outcome requests
CREATE INDEX IF NOT EXISTS idx_calendly_events_outcome_pending
  ON calendly_events (end_time)
  WHERE is_system_booked = true AND outcome_requested = false AND status = 'active';

-- ─── meeting_outcomes table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meeting_outcomes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        uuid NOT NULL REFERENCES calendly_events(id),
  -- Outcome
  outcome_status  text NOT NULL,               -- committed | interested | not_interested | no_show | no_response | planning_to_join | thinking | not_for_me
  notes           text,                        -- optional free-text
  action_items    text[],                      -- parsed from notes (future)
  -- Source
  reported_via    text DEFAULT 'recruiter',    -- recruiter | prospect | auto_close | dashboard
  reported_at     timestamptz DEFAULT now(),
  -- Auto-timeout
  auto_closed     boolean DEFAULT false,       -- true if 48h passed with no reply
  auto_closed_at  timestamptz,
  created_at      timestamptz DEFAULT now()
);

-- One outcome per event per role (recruiter and prospect can both respond)
CREATE UNIQUE INDEX IF NOT EXISTS idx_meeting_outcomes_event_role
  ON meeting_outcomes (event_id, reported_via);

CREATE INDEX IF NOT EXISTS idx_meeting_outcomes_event
  ON meeting_outcomes (event_id);

CREATE INDEX IF NOT EXISTS idx_meeting_outcomes_status
  ON meeting_outcomes (outcome_status);

-- ─── Add 'committing' as a recognized interaction_stage ──────────────
-- (No enum to alter — these are text columns. Just documenting valid values.)
-- Valid status values after this migration:
--   pending, drafted, reviewed, approved, sent,
--   follow_up_1, follow_up_2, follow_up_exhausted,
--   scheduled, committing, recruited,
--   converted, rejected, opted_out, held
--
-- Valid interaction_stage values after this migration:
--   booked, recruitment_planned, meeting_positive, meeting_declined,
--   no_show, survey_engaged, warming, cooling
--
-- No schema change needed (text columns), but documenting for reference.

COMMENT ON TABLE meeting_outcomes IS 'Post-meeting feedback from recruiter and/or prospect. Drives prospect status promotion (scheduled → committing → recruited).';
