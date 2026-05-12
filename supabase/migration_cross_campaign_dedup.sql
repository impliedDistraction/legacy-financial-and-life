-- Migration: Cross-campaign email deduplication
-- Prevents the same email address from being imported into multiple campaigns
-- simultaneously, while still allowing:
--   - NULL emails (phone-only prospects)
--   - Re-engagement after a prospect reaches a terminal status
--
-- Run this in Supabase SQL Editor (Legacy Financial project)

-- ═══════════════════════════════════════════
-- 1. Unique index on email for active prospects
-- ═══════════════════════════════════════════
-- Only enforces uniqueness for prospects in active pipeline statuses.
-- Terminal statuses (rejected, opted_out, follow_up_exhausted, converted)
-- are excluded so the same person can be re-engaged in a future campaign.

CREATE UNIQUE INDEX IF NOT EXISTS idx_recruitment_prospects_email_active
  ON recruitment_prospects (lower(email))
  WHERE email IS NOT NULL
    AND status NOT IN ('rejected', 'opted_out', 'follow_up_exhausted', 'converted');

-- ═══════════════════════════════════════════
-- 2. Clean up any existing duplicates first
-- ═══════════════════════════════════════════
-- If duplicates already exist, keep the one with the most progress
-- (latest updated_at) and move others to 'rejected' so the unique
-- index can be created without conflict.
--
-- Run this BEFORE the CREATE UNIQUE INDEX above if it fails:
--
-- WITH ranked AS (
--   SELECT id,
--          ROW_NUMBER() OVER (
--            PARTITION BY lower(email)
--            ORDER BY
--              CASE status
--                WHEN 'sent' THEN 1
--                WHEN 'follow_up_1' THEN 2
--                WHEN 'follow_up_2' THEN 3
--                WHEN 'approved' THEN 4
--                WHEN 'reviewed' THEN 5
--                WHEN 'drafted' THEN 6
--                WHEN 'pending' THEN 7
--                ELSE 8
--              END,
--              updated_at DESC NULLS LAST
--          ) AS rn
--   FROM recruitment_prospects
--   WHERE email IS NOT NULL
--     AND status NOT IN ('rejected', 'opted_out', 'follow_up_exhausted', 'converted')
-- )
-- UPDATE recruitment_prospects
-- SET status = 'rejected',
--     properties = properties || '{"rejected_by": "dedup_migration", "rejection_reason": "duplicate_email_cleanup"}'::jsonb,
--     updated_at = now()
-- WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
