-- Hotfix: Re-queue QA-rejected prospects for re-evaluation
--
-- The initial QA run rejected prospects with "No valid email address" as a hard failure.
-- This has been fixed — missing email is now a warning (phone outreach is valid).
-- Re-queue all QA-rejected prospects for another pass.
--
-- Run in Supabase SQL Editor (Legacy Financial project)

UPDATE recruitment_prospects
SET status = 'drafted',
    qa_status = NULL,
    qa_score = NULL,
    qa_rejection_reason = NULL,
    updated_at = now()
WHERE status = 'rejected'
  AND qa_rejection_reason IS NOT NULL
  AND qa_rejection_reason LIKE '%No valid email address%';
