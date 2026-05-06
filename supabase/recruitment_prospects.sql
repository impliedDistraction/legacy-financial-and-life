-- Table: recruitment_prospects
-- Used by the /recruitment dashboard for AI-powered agent outreach campaigns.
-- NOTE: This table already exists in production (token-solutions Supabase).

CREATE TABLE IF NOT EXISTS recruitment_prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  
  -- Prospect info (from CSV upload)
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  state TEXT,
  city TEXT,
  experience_level TEXT DEFAULT 'unknown',
  current_agency TEXT,
  notes TEXT,
  source TEXT DEFAULT 'csv_import',
  
  -- Campaign grouping
  campaign_id UUID,
  campaign_name TEXT,
  
  -- AI-generated content
  email_subject TEXT,
  email_body TEXT,
  call_script TEXT,
  voicemail_script TEXT,
  personal_notes TEXT,
  fit_score INTEGER,
  fit_reason TEXT,
  
  -- Workflow status: pending → processed → approved → sent → converted | rejected
  status TEXT NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  processed_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by TEXT,
  edited_email_body TEXT,
  
  -- Tracking
  email_sent_at TIMESTAMPTZ,
  email_opened_at TIMESTAMPTZ,
  email_replied_at TIMESTAMPTZ,
  call_made_at TIMESTAMPTZ,
  call_outcome TEXT,
  properties JSONB DEFAULT '{}'::jsonb
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_recruitment_prospects_status ON recruitment_prospects(status);
CREATE INDEX IF NOT EXISTS idx_recruitment_prospects_campaign ON recruitment_prospects(campaign_id);
CREATE INDEX IF NOT EXISTS idx_recruitment_prospects_email ON recruitment_prospects(email);
CREATE INDEX IF NOT EXISTS idx_recruitment_prospects_fit_score ON recruitment_prospects(fit_score DESC NULLS LAST);
