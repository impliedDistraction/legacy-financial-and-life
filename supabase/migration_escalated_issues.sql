-- Migration: escalated_issues table
-- Stores chatbot-escalated technical issues for triage and review.

CREATE TABLE IF NOT EXISTS escalated_issues (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),

  -- Source context
  client        text NOT NULL DEFAULT 'legacy-financial',
  source        text NOT NULL DEFAULT 'chatbot',      -- chatbot | join-chat | manual
  session_id    text,                                   -- chat session ID
  page_url      text,                                   -- page where issue originated

  -- Issue details
  category      text NOT NULL DEFAULT 'technical',      -- technical | billing | compliance | other
  summary       text NOT NULL,                          -- user's description of the issue
  conversation  jsonb,                                  -- recent chat messages for context
  user_contact  jsonb,                                  -- { name, email, phone } if provided

  -- Triage
  status        text NOT NULL DEFAULT 'new',            -- new | triaged | notified | reviewing | resolved | dismissed
  severity      text DEFAULT 'unknown',                 -- unknown | low | medium | high | critical
  auto_triage   jsonb,                                  -- AI triage result: { is_real, confidence, reason }

  -- Resolution
  notified_at   timestamptz,
  reviewed_at   timestamptz,
  resolved_at   timestamptz,
  resolution    text,
  reviewed_by   text                                     -- human or 'copilot-opus'
);

-- Indexes for queue processing
CREATE INDEX IF NOT EXISTS idx_escalated_issues_status ON escalated_issues (status);
CREATE INDEX IF NOT EXISTS idx_escalated_issues_client ON escalated_issues (client, status);
CREATE INDEX IF NOT EXISTS idx_escalated_issues_created ON escalated_issues (created_at DESC);
