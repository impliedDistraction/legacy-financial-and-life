-- Migration: Scope of Appointment (SOA) tracking
-- Manages SOA form delivery and confirmation for Medicare-related meetings.
-- CMS requires a signed SOA before any Medicare sales presentation.

-- soa_records: tracks SOA forms sent, confirmed, and attached to meetings
CREATE TABLE IF NOT EXISTS soa_records (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        uuid REFERENCES calendly_events(id),  -- linked calendar event
  
  -- Parties
  agent_name      text NOT NULL,                   -- agent presenting
  agent_npn       text,                            -- agent NPN (for the form)
  prospect_name   text NOT NULL,                   -- beneficiary/consumer
  prospect_email  text,
  prospect_phone  text,
  
  -- SOA details
  state           text NOT NULL,                   -- determines which form template
  topics_discussed text[] DEFAULT '{}',            -- Medicare Advantage, PDP, Medigap, etc.
  meeting_date    timestamptz NOT NULL,            -- when the meeting is scheduled
  meeting_type    text DEFAULT 'phone',            -- phone, video, in-person
  
  -- Delivery & confirmation
  status          text NOT NULL DEFAULT 'pending', -- pending, sent, confirmed, expired, waived
  sent_at         timestamptz,
  confirmed_at    timestamptz,
  confirmation_ip text,                            -- IP at time of confirmation
  token           text,                            -- HMAC token for confirmation link
  
  -- Who triggered it
  trigger_source  text DEFAULT 'auto',             -- auto (system detected), manual (user tagged), api
  auto_detected   boolean DEFAULT true,            -- was this auto-tagged as Medicare?
  detection_reason text,                           -- why we think this needs SOA
  
  -- Metadata
  campaign_id     uuid,                            -- if tied to a specific campaign
  client_id       text,                            -- future: multi-client support
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_soa_records_event ON soa_records (event_id);
CREATE INDEX IF NOT EXISTS idx_soa_records_status ON soa_records (status, meeting_date);
CREATE INDEX IF NOT EXISTS idx_soa_records_prospect ON soa_records (prospect_email);
CREATE INDEX IF NOT EXISTS idx_soa_records_state ON soa_records (state);

-- Add SOA tracking columns to calendly_events
ALTER TABLE calendly_events ADD COLUMN IF NOT EXISTS soa_required boolean DEFAULT false;
ALTER TABLE calendly_events ADD COLUMN IF NOT EXISTS soa_confirmed boolean DEFAULT false;
ALTER TABLE calendly_events ADD COLUMN IF NOT EXISTS soa_record_id uuid REFERENCES soa_records(id);
ALTER TABLE calendly_events ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

-- Index for tag-based queries
CREATE INDEX IF NOT EXISTS idx_calendly_events_tags ON calendly_events USING gin(tags);
