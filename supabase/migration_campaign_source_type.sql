-- Migration: Add source_type to recruitment_campaigns
-- Tracks whether a campaign uses Prophog, FL Licensee CSV, manual CSV, or pool as its source.
-- Run this in Supabase SQL Editor (Legacy Financial project).

ALTER TABLE recruitment_campaigns
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'prophog';

COMMENT ON COLUMN recruitment_campaigns.source_type IS 'Lead source type: prophog, fl_licensee, csv, pool';
