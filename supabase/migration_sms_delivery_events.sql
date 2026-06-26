-- SMS Delivery Events table for 10DLC compliance record-keeping
-- Logs all Telnyx messaging webhook events (delivery receipts, failures, etc.)
-- Created: 2026-06-26

CREATE TABLE IF NOT EXISTS sms_delivery_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id text,
  event_type text NOT NULL,
  direction text DEFAULT 'outbound',
  from_number text,
  to_number text,
  status text,
  error_code text,
  error_detail text,
  raw_payload jsonb,
  occurred_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Index for looking up delivery status by message ID
CREATE INDEX IF NOT EXISTS idx_sms_delivery_events_message_id
  ON sms_delivery_events (message_id);

-- Index for finding failures by phone number
CREATE INDEX IF NOT EXISTS idx_sms_delivery_events_to_number
  ON sms_delivery_events (to_number) WHERE error_code IS NOT NULL;

-- Index for time-based queries (compliance auditing)
CREATE INDEX IF NOT EXISTS idx_sms_delivery_events_occurred_at
  ON sms_delivery_events (occurred_at DESC);

-- Allow service role full access
ALTER TABLE sms_delivery_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON sms_delivery_events
  FOR ALL USING (auth.role() = 'service_role');
