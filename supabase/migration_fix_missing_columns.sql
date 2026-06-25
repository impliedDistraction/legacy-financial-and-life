-- Migration: Add missing columns causing Supabase errors
-- Run in Supabase SQL Editor for: Legacy Financial (kxmojndpgxgbykxjtxba)
-- Fixes: "column recruitment_prospects.opt_out does not exist"
--        "column recruitment_campaigns.properties does not exist"

-- 1. Add opt_out column to recruitment_prospects
-- Used by cold-caller.js and cold-caller-sales.js to filter out opted-out prospects
ALTER TABLE recruitment_prospects
  ADD COLUMN IF NOT EXISTS opt_out BOOLEAN DEFAULT false;

-- Index for filtering
CREATE INDEX IF NOT EXISTS idx_recruitment_prospects_opt_out
  ON recruitment_prospects (opt_out)
  WHERE opt_out = true;

-- 2. Add properties JSONB column to recruitment_campaigns
-- Used by follow-up.js (survey_campaign_id, intro_text, sign_off, subject)
-- and survey-sender.js for campaign-level config
ALTER TABLE recruitment_campaigns
  ADD COLUMN IF NOT EXISTS properties JSONB DEFAULT '{}'::jsonb;

-- 3. Enable RLS on dialog_trees table
ALTER TABLE dialog_trees ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated service role full access (API uses service role key)
CREATE POLICY "Service role full access on dialog_trees"
  ON dialog_trees
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 4. Add 'inbound' to dialog_trees category check constraint
-- Drop existing constraint and re-create with inbound included
ALTER TABLE dialog_trees DROP CONSTRAINT IF EXISTS dialog_trees_category_check;
ALTER TABLE dialog_trees
  ADD CONSTRAINT dialog_trees_category_check
  CHECK (category IN ('sales', 'recruitment', 'client_outreach', 'inbound', 'custom'));
