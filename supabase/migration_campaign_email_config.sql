-- Add campaign-level email configuration fields
-- sign_off: how the email should be signed (e.g., team name, AI disclosure)
-- reply_to_email: where replies go (defaults to system email, not personal)

ALTER TABLE recruitment_campaigns
  ADD COLUMN IF NOT EXISTS sign_off text DEFAULT 'Legacy Financial Recruiting Team',
  ADD COLUMN IF NOT EXISTS reply_to_email text DEFAULT NULL;

-- Add interaction tracking fields to prospects for CRM-like behavior
ALTER TABLE recruitment_prospects
  ADD COLUMN IF NOT EXISTS email_opened_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS email_clicked_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS replied_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS follow_up_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_interaction_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS interaction_stage text DEFAULT 'new';

-- Index for tracking tab queries
CREATE INDEX IF NOT EXISTS idx_prospects_interaction_stage ON recruitment_prospects (interaction_stage);
CREATE INDEX IF NOT EXISTS idx_prospects_sent_at ON recruitment_prospects (sent_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_prospects_last_interaction ON recruitment_prospects (last_interaction_at DESC NULLS LAST);
