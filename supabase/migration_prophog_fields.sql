-- Migration: Add indexes for Prophog-sourced prospect deduplication.
-- NPN is stored in properties JSONB, so we index the extracted value.
-- Also add a source index for filtering Prophog vs CSV imports.

CREATE INDEX IF NOT EXISTS idx_recruitment_prospects_npn
  ON recruitment_prospects ((properties->>'npn'))
  WHERE properties->>'npn' IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_recruitment_prospects_source
  ON recruitment_prospects (source);
