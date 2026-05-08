-- Migration: Create recruitment_campaigns table + research columns on prospects
-- Run this in Supabase SQL Editor

-- ═══════════════════════════════════════════
-- 1. Campaigns table
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.recruitment_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  client text NOT NULL DEFAULT 'legacy',
  status text NOT NULL DEFAULT 'active',
  search_state text NOT NULL DEFAULT 'Georgia',
  search_filters jsonb NOT NULL DEFAULT '{}',
  credit_budget integer NOT NULL DEFAULT 100,
  credits_used integer NOT NULL DEFAULT 0,
  max_pages_per_run integer NOT NULL DEFAULT 20,
  schedule_interval_minutes integer NOT NULL DEFAULT 60,
  schedule_jitter_minutes integer NOT NULL DEFAULT 15,
  next_run_at timestamptz,
  last_run_at timestamptz,
  require_review boolean NOT NULL DEFAULT true,
  notes text DEFAULT '',
  created_by text DEFAULT 'unknown',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for cron scheduler queries
CREATE INDEX IF NOT EXISTS idx_campaigns_active_next_run
  ON recruitment_campaigns (status, next_run_at)
  WHERE status = 'active';

-- ═══════════════════════════════════════════
-- 2. Research columns on prospects
-- ═══════════════════════════════════════════
ALTER TABLE recruitment_prospects
  ADD COLUMN IF NOT EXISTS research_status text DEFAULT 'unscored',
  ADD COLUMN IF NOT EXISTS research_score numeric(3,1),
  ADD COLUMN IF NOT EXISTS researched_at timestamptz,
  ADD COLUMN IF NOT EXISTS web_presence jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES recruitment_campaigns(id);

CREATE INDEX IF NOT EXISTS idx_prospects_research_status
  ON recruitment_prospects (research_status)
  WHERE research_status = 'unscored';

CREATE INDEX IF NOT EXISTS idx_prospects_campaign
  ON recruitment_prospects (campaign_id)
  WHERE campaign_id IS NOT NULL;

-- ═══════════════════════════════════════════
-- 3. RPC for prospect counts per campaign
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
