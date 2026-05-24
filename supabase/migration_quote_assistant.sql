-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION: Quote Assistant — Inbound email plan quoting system
-- Run in Supabase SQL Editor (Legacy Financial: kxmojndpgxgbykxjtxba)
-- Safe to re-run — all statements use IF NOT EXISTS.
--
-- Tables:
--   quote_threads  — conversation state for each quote request
--   quote_usage    — per-sender usage tracking for tier enforcement
-- ═══════════════════════════════════════════════════════════════════


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 1. quote_threads — each email-based quote conversation         │
-- └─────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS quote_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Sender identification
  sender_email TEXT NOT NULL,
  sender_name TEXT,
  thread_subject TEXT,

  -- Lifecycle status
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'extracting', 'awaiting_info', 'recommending', 'complete', 'expired', 'blocked')),

  -- AI-extracted structured data (accumulated across messages)
  extracted_data JSONB NOT NULL DEFAULT '{}',
  missing_fields TEXT[] DEFAULT '{}',

  -- Classification
  request_type TEXT CHECK (request_type IN ('under_65', 'medicare', 'life', 'property', 'unknown')),
  product_type TEXT,   -- medicare_advantage, med_supp, aca_marketplace, life, etc.
  zip TEXT,
  state TEXT,
  age INT,

  -- Conversation history
  -- [{role: 'consumer'|'assistant', content: '', at: '', message_id: ''}]
  messages JSONB NOT NULL DEFAULT '[]',
  message_count INT NOT NULL DEFAULT 1,

  -- Plan recommendation output (from plan-recommender.js)
  recommendation JSONB,

  -- Product matching / agent routing
  matched_agent_id UUID,
  match_type TEXT CHECK (match_type IN ('owner', 'subscriber', 'recruited')),

  -- Usage tracking (which request # for this sender)
  usage_number INT NOT NULL DEFAULT 1,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '30 days'),
  last_consumer_reply_at TIMESTAMPTZ,
  last_assistant_reply_at TIMESTAMPTZ
);

-- Indexes for worker queries
CREATE INDEX IF NOT EXISTS idx_quote_threads_sender
  ON quote_threads(sender_email);

CREATE INDEX IF NOT EXISTS idx_quote_threads_status
  ON quote_threads(status);

CREATE INDEX IF NOT EXISTS idx_quote_threads_status_updated
  ON quote_threads(status, updated_at)
  WHERE status IN ('new', 'awaiting_info');

CREATE INDEX IF NOT EXISTS idx_quote_threads_zip
  ON quote_threads(zip)
  WHERE zip IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quote_threads_expires
  ON quote_threads(expires_at)
  WHERE status NOT IN ('complete', 'expired', 'blocked');


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 2. quote_usage — per-sender metering for tier enforcement      │
-- └─────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS quote_usage (
  sender_email TEXT PRIMARY KEY,
  completed_count INT NOT NULL DEFAULT 0,
  active_threads INT NOT NULL DEFAULT 0,
  tier TEXT NOT NULL DEFAULT 'free'
    CHECK (tier IN ('free', 'starter', 'pro', 'agency')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  first_request_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_request_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  blocked_at TIMESTAMPTZ,
  blocked_reason TEXT,
  notes TEXT
);


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 3. RLS — service role only (no public access)                  │
-- └─────────────────────────────────────────────────────────────────┘

ALTER TABLE quote_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_usage ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS; no public policies needed.
-- These tables are only accessed server-side via service_role key.


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 4. Functions — auto-update timestamps                          │
-- └─────────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION update_quote_thread_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_quote_thread_updated ON quote_threads;
CREATE TRIGGER trg_quote_thread_updated
  BEFORE UPDATE ON quote_threads
  FOR EACH ROW
  EXECUTE FUNCTION update_quote_thread_timestamp();
