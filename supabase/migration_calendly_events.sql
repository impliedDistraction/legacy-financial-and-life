-- Migration: Calendly event sync & meeting outcome tracking
-- Part of the "Overwatch" (Calendly Meeting Assistant) feature.
-- Run this against the Legacy Financial Supabase project.

-- calendly_events: stores synced events from Calendly API, matched to prospects
CREATE TABLE IF NOT EXISTS calendly_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendly_uri    text UNIQUE NOT NULL,           -- Calendly event URI (dedup key)
  event_type      text,                            -- e.g. "30 Minute Meeting"
  start_time      timestamptz NOT NULL,
  end_time        timestamptz NOT NULL,
  location        text,                            -- Zoom link, phone, in-person
  status          text DEFAULT 'active',           -- active | canceled | completed
  invitee_name    text,
  invitee_email   text,
  invitee_phone   text,
  -- Matching to recruitment pipeline
  prospect_id     uuid REFERENCES recruitment_prospects(id),
  match_source    text,                            -- 'email' | 'name' | 'phone' | null
  is_system_booked boolean DEFAULT false,          -- booked via /join recruitment flow
  -- Reminder/brief tracking (future phases)
  reminder_sent   boolean DEFAULT false,
  reminder_sent_at timestamptz,
  brief_sent      boolean DEFAULT false,
  brief_sent_at   timestamptz,
  followup_sent   boolean DEFAULT false,
  followup_sent_at timestamptz,
  -- Raw payload
  calendly_payload jsonb,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendly_events_start ON calendly_events (start_time);
CREATE INDEX IF NOT EXISTS idx_calendly_events_status ON calendly_events (status, start_time);
CREATE INDEX IF NOT EXISTS idx_calendly_events_invitee ON calendly_events (invitee_email);
CREATE INDEX IF NOT EXISTS idx_calendly_events_prospect ON calendly_events (prospect_id);

-- meeting_outcomes: stores Tim's post-meeting notes (future phase)
CREATE TABLE IF NOT EXISTS meeting_outcomes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        uuid NOT NULL REFERENCES calendly_events(id),
  outcome_status  text,                            -- interested | not_interested | follow_up | no_show | no_response
  notes           text,
  action_items    text[],
  reported_via    text DEFAULT 'manual',           -- email | dashboard | manual
  reported_at     timestamptz,
  auto_closed     boolean DEFAULT false,
  auto_closed_at  timestamptz,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meeting_outcomes_event ON meeting_outcomes (event_id);

-- RLS: service-role only (no anon access)
ALTER TABLE calendly_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_outcomes ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (idempotent)
DROP POLICY IF EXISTS "service_role_full_access" ON calendly_events;
CREATE POLICY "service_role_full_access" ON calendly_events
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service_role_full_access" ON meeting_outcomes;
CREATE POLICY "service_role_full_access" ON meeting_outcomes
  FOR ALL USING (auth.role() = 'service_role');
