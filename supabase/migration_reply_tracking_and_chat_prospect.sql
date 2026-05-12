-- Migration: Chat Logs Table + Reply Tracking & Chat-Prospect Linking
-- 1. Creates recruitment_chat_logs table (if not already present)
-- 2. Adds prospect_id column so chat sessions can be traced to specific prospects
-- 3. Adds index for querying chat logs by prospect
-- 4. Documents the new 'replied' interaction_stage value used when a prospect replies to email
--
-- Run this in Supabase SQL Editor (Legacy Financial project: kxmojndpgxgbykxjtxba)

-- ═══════════════════════════════════════════
-- 1. Create recruitment_chat_logs table
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.recruitment_chat_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  client_ip text,
  prospect_id uuid,
  user_message text NOT NULL,
  assistant_message text NOT NULL,
  flagged boolean NOT NULL DEFAULT false,
  flag_reason text,
  latency_ms integer,
  token_count integer,
  reviewed_by text,
  review_score integer,
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- If the table already existed without prospect_id, add it now
ALTER TABLE recruitment_chat_logs
  ADD COLUMN IF NOT EXISTS prospect_id uuid;

COMMENT ON COLUMN recruitment_chat_logs.session_id IS 'Groups messages in the same conversation';
COMMENT ON COLUMN recruitment_chat_logs.prospect_id IS 'Links chat exchange to a recruitment_prospects record (set when visitor arrives via email CTA with ?pid=)';

-- ═══════════════════════════════════════════
-- 2. Indexes for chat logs
-- ═══════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_chat_logs_review_queue
  ON recruitment_chat_logs (flagged DESC, reviewed_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_logs_session
  ON recruitment_chat_logs (session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_chat_logs_created
  ON recruitment_chat_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_logs_prospect
  ON recruitment_chat_logs (prospect_id, created_at DESC)
  WHERE prospect_id IS NOT NULL;

-- ═══════════════════════════════════════════
-- 3. RLS: service role only (no public access)
-- ═══════════════════════════════════════════
ALTER TABLE public.recruitment_chat_logs ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════
-- 4. Index for reply-stage prospects
-- ═══════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_prospects_replied
  ON recruitment_prospects (updated_at DESC)
  WHERE interaction_stage = 'replied';
