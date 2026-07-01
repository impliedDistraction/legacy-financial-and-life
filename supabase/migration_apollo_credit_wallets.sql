-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION: Pipeline credit wallets — unified credit system
-- Run in Supabase SQL Editor (Legacy Financial: kxmojndpgxgbykxjtxba)
-- Safe to re-run — all statements use IF NOT EXISTS.
--
-- Single token economy for all pipeline actions:
--   - Recruitment processing: 1 credit/prospect (research + AI draft + QA + send)
--   - Sales processing: 1 credit/prospect
--   - Apollo email reveal: 1 credit/reveal
--   - Voice call: 2 credits/call (real-time GPU + telephony)
--   - Follow-up emails & surveys: 0 (included in initial processing credit)
--
-- System auto-pauses ALL campaigns when wallet balance hits zero.
-- Credits priced at $0.50 each.
-- ═══════════════════════════════════════════════════════════════════


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 1. apollo_credit_wallets — per-client credit balance            │
-- └─────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS apollo_credit_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Client identity (for multi-client future; currently just legacy_financial)
  client_slug TEXT NOT NULL UNIQUE DEFAULT 'legacy_financial',
  client_name TEXT NOT NULL DEFAULT 'Legacy Financial & Life',

  -- Balance
  balance INTEGER NOT NULL DEFAULT 0,           -- current available credits
  lifetime_purchased INTEGER NOT NULL DEFAULT 0, -- total ever deposited
  lifetime_used INTEGER NOT NULL DEFAULT 0,      -- total ever consumed

  -- Alerts
  low_balance_threshold INTEGER NOT NULL DEFAULT 50,  -- alert when balance drops below this
  low_balance_alerted_at TIMESTAMPTZ,                  -- last time we sent low-balance alert
  zero_balance_paused_at TIMESTAMPTZ,                  -- when campaigns were auto-paused

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert default wallet for Legacy Financial (idempotent)
INSERT INTO apollo_credit_wallets (client_slug, client_name, balance)
VALUES ('legacy_financial', 'Legacy Financial & Life', 0)
ON CONFLICT (client_slug) DO NOTHING;


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 2. apollo_credit_transactions — audit log of all credit flow    │
-- └─────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS apollo_credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  wallet_id UUID NOT NULL REFERENCES apollo_credit_wallets(id),

  -- Transaction details
  type TEXT NOT NULL,                -- 'deposit', 'reveal', 'processing', 'voice_call', 'adjustment', 'refund'
  amount INTEGER NOT NULL,           -- positive = credit added, negative = credit consumed
  balance_after INTEGER NOT NULL,    -- wallet balance after this transaction

  -- Context
  description TEXT,                  -- human-readable (e.g., "Email reveal for John Smith")
  campaign_id UUID,                  -- which campaign consumed this credit (nullable)
  prospect_id UUID,                  -- which prospect was revealed (nullable)
  payment_reference TEXT,            -- Stripe payment ID or manual reference (nullable)

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_credit_transactions_wallet
  ON apollo_credit_transactions (wallet_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_type
  ON apollo_credit_transactions (type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_campaign
  ON apollo_credit_transactions (campaign_id)
  WHERE campaign_id IS NOT NULL;
