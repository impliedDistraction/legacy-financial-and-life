-- Track consecutive zero-result runs to enable auto-pause when search space is exhausted
-- This saves Prophog credits by stopping campaigns that produce no new prospects.
ALTER TABLE recruitment_campaigns
  ADD COLUMN IF NOT EXISTS consecutive_zero_runs integer DEFAULT 0;
