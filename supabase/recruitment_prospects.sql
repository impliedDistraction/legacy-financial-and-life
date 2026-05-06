-- Table: recruitment_prospects
-- Used by the /recruitment dashboard for AI-powered agent outreach campaigns.
-- NOTE: This table exists in legacy-financial Supabase (kxmojndpgxgbykxjtxba).

CREATE TABLE IF NOT EXISTS recruitment_prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
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
  call_opener TEXT,
  call_voicemail TEXT,
  personal_notes TEXT,
  fit_score INTEGER,
  fit_reason TEXT,
  
  -- Workflow status: pending → processed → approved → sent → converted | rejected
  status TEXT NOT NULL DEFAULT 'pending',
  processed_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  
  -- Overflow storage for optional fields (rejection_reason, call_outcome, etc.)
  properties JSONB DEFAULT '{}'::jsonb
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_recruitment_prospects_status ON recruitment_prospects(status);
CREATE INDEX IF NOT EXISTS idx_recruitment_prospects_campaign ON recruitment_prospects(campaign_id);
CREATE INDEX IF NOT EXISTS idx_recruitment_prospects_email ON recruitment_prospects(email);
CREATE INDEX IF NOT EXISTS idx_recruitment_prospects_fit_score ON recruitment_prospects(fit_score DESC NULLS LAST);
