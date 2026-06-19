-- Call Feedback System
-- Allows clients (Tim/Beth) to rate and provide feedback on AI voice calls
-- for continuous improvement of the voice agent.

CREATE TABLE IF NOT EXISTS call_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id TEXT NOT NULL,
  call_ts TIMESTAMPTZ,
  caller_number TEXT,
  called_number TEXT,
  direction TEXT,
  mode TEXT,
  duration_s INTEGER,
  turns INTEGER,
  -- Feedback fields
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  accuracy_rating INTEGER CHECK (accuracy_rating >= 1 AND accuracy_rating <= 5),
  issues TEXT[] DEFAULT '{}',
  notes TEXT,
  reviewer_phone TEXT,
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for looking up feedback by call_id
CREATE INDEX IF NOT EXISTS idx_call_feedback_call_id ON call_feedback(call_id);

-- Index for time-based queries (dashboards)
CREATE INDEX IF NOT EXISTS idx_call_feedback_created_at ON call_feedback(created_at DESC);

-- RLS (service role only — no public access)
ALTER TABLE call_feedback ENABLE ROW LEVEL SECURITY;
