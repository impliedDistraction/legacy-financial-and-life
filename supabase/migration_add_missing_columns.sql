-- Migration: Add missing columns to recruitment_prospects
-- Run this in Supabase SQL Editor for: supabase-legacy-financial

ALTER TABLE recruitment_prospects ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
ALTER TABLE recruitment_prospects ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE recruitment_prospects ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE recruitment_prospects ADD COLUMN IF NOT EXISTS edited_email_body TEXT;
ALTER TABLE recruitment_prospects ADD COLUMN IF NOT EXISTS call_made_at TIMESTAMPTZ;
ALTER TABLE recruitment_prospects ADD COLUMN IF NOT EXISTS call_outcome TEXT;
ALTER TABLE recruitment_prospects ADD COLUMN IF NOT EXISTS email_opened_at TIMESTAMPTZ;
ALTER TABLE recruitment_prospects ADD COLUMN IF NOT EXISTS email_replied_at TIMESTAMPTZ;
