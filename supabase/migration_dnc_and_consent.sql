-- Migration: DNC screening and text consent tracking
-- The DNC status and text consent are stored in properties JSONB for now.
-- This migration adds dedicated columns for query performance + the
-- interaction_stage 'interested' value for landing page conversions.

-- Add interaction_count if not present (may have been added by prior migration)
ALTER TABLE recruitment_prospects
  ADD COLUMN IF NOT EXISTS interaction_count integer DEFAULT 0;

-- Ensure interaction_stage supports 'interested' (from landing page)
-- No schema change needed — it's a text column already.

-- Add web_presence column if not already present (stores research trait scores)
ALTER TABLE recruitment_prospects
  ADD COLUMN IF NOT EXISTS web_presence jsonb DEFAULT NULL;

-- Index for DNC status lookups (stored in properties->>'dnc_status')
CREATE INDEX IF NOT EXISTS idx_prospects_dnc_status
  ON recruitment_prospects ((properties->>'dnc_status'));

-- Index for text consent (from landing page)
CREATE INDEX IF NOT EXISTS idx_prospects_text_consent
  ON recruitment_prospects ((properties->>'text_consent'));

-- Index for source = 'landing_page' (warm leads from /join)
CREATE INDEX IF NOT EXISTS idx_prospects_source
  ON recruitment_prospects (source);

-- Comments for documentation
COMMENT ON COLUMN recruitment_prospects.web_presence IS 'Research findings: Google results, trait scores (trust network, professional presence, sales background, compliance, opportunity), signals array';
