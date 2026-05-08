-- Add auto_relaunch column to recruitment_campaigns
-- When true, campaign credits reset to 0 and status returns to 'active'
-- when budget is exhausted, instead of pausing.
ALTER TABLE recruitment_campaigns
  ADD COLUMN IF NOT EXISTS auto_relaunch boolean DEFAULT false;
