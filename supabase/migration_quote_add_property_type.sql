-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION: Add 'property' to request_type CHECK constraint
-- Run in Supabase SQL Editor (Legacy Financial: kxmojndpgxgbykxjtxba)
-- ═══════════════════════════════════════════════════════════════════

-- Drop the existing constraint and recreate with 'property' added
ALTER TABLE quote_threads
  DROP CONSTRAINT IF EXISTS quote_threads_request_type_check;

ALTER TABLE quote_threads
  ADD CONSTRAINT quote_threads_request_type_check
  CHECK (request_type IN ('under_65', 'medicare', 'life', 'property', 'unknown'));
