-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION: Sales campaigns — outbound sales campaign management
-- Run in Supabase SQL Editor (Legacy Financial: kxmojndpgxgbykxjtxba)
-- Safe to re-run — all statements use IF NOT EXISTS.
--
-- Adds campaign-based management for outbound sales leads sourced from
-- Apollo (and future lead sources). Parallels recruitment_campaigns but
-- targets consumers (life, health, T65, key-person insurance buyers).
-- ═══════════════════════════════════════════════════════════════════


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 1. sales_campaigns — campaign definitions                      │
-- └─────────────────────────────────────────────────────────────────┘

CREATE TABLE IF NOT EXISTS sales_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Campaign identity
  name TEXT NOT NULL,
  objective TEXT NOT NULL,                          -- 't65', 'health', 'life', 'key_person', 'final_expense'
  description TEXT,                                 -- human description of target audience
  apollo_prompt TEXT,                               -- generated prompt for Apollo AI search
  apollo_params JSONB DEFAULT '{}'::jsonb,          -- structured Apollo search params

  -- Targeting
  states TEXT[] DEFAULT '{}',                       -- target states (e.g., '{GA,FL,TX}')
  seniorities TEXT[] DEFAULT '{}',                  -- Apollo seniority filters
  industries TEXT[] DEFAULT '{}',                   -- target industries
  employee_ranges TEXT[] DEFAULT '{}',              -- company size filters
  custom_titles TEXT[] DEFAULT '{}',                -- specific job titles to target

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'draft',             -- draft, sourcing, ready, active, paused, completed
  -- draft: created, defining targets
  -- sourcing: Apollo search prompt generated, awaiting list upload/pull
  -- ready: leads imported, ready to activate
  -- active: outreach in progress
  -- paused: temporarily halted
  -- completed: campaign finished

  -- Send configuration
  daily_limit INTEGER DEFAULT 50,                   -- max sends per day for this campaign
  send_hours_start INTEGER DEFAULT 9,               -- earliest send hour (ET)
  send_hours_end INTEGER DEFAULT 17,                -- latest send hour (ET)
  send_days TEXT[] DEFAULT '{mon,tue,wed,thu,fri}', -- send days of week

  -- Email config
  from_name TEXT DEFAULT 'Beth Byrd',
  from_label TEXT DEFAULT 'Legacy Financial & Life',
  reply_to TEXT DEFAULT 'beth@legacyf-l.com',
  sign_off TEXT DEFAULT 'Beth Byrd, Legacy Financial & Life',
  cta_url TEXT DEFAULT 'https://www.planenroll.com/life?purl=Beth-Byrd',
  cta_label TEXT DEFAULT 'Get Your Free Quote →',
  secondary_cta_url TEXT DEFAULT 'https://calendly.com/bethandtim-legacyf-l/30min',
  secondary_cta_label TEXT DEFAULT 'Or book a quick call with me',

  -- Stats (cached, updated by workers)
  stats JSONB DEFAULT '{}'::jsonb,
  -- { total: N, sent: N, opened: N, clicked: N, booked: N, quoted: N, bound: N }

  -- Timestamps
  activated_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sales_campaigns_status
  ON sales_campaigns (status);

CREATE INDEX IF NOT EXISTS idx_sales_campaigns_objective
  ON sales_campaigns (objective);


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 2. Add campaign_id to recruitment_prospects for sales leads     │
-- └─────────────────────────────────────────────────────────────────┘

-- Sales leads in recruitment_prospects (source='apollo_sales_search')
-- can now reference which campaign they belong to.
ALTER TABLE recruitment_prospects
  ADD COLUMN IF NOT EXISTS sales_campaign_id UUID REFERENCES sales_campaigns(id);

CREATE INDEX IF NOT EXISTS idx_recruitment_prospects_sales_campaign
  ON recruitment_prospects (sales_campaign_id) WHERE sales_campaign_id IS NOT NULL;


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 3. Updated timestamp trigger                                   │
-- └─────────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION update_sales_campaigns_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_sales_campaigns_updated_at'
  ) THEN
    CREATE TRIGGER trg_sales_campaigns_updated_at
      BEFORE UPDATE ON sales_campaigns
      FOR EACH ROW EXECUTE FUNCTION update_sales_campaigns_updated_at();
  END IF;
END $$;
