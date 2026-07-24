-- Keep an active licensee prospect unique by its NPN. Email-based protection
-- cannot cover DOI bulk imports because many records have no email address.
-- Preserve the most advanced record and retain the others as audited rejects.

WITH ranked_duplicates AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY properties->>'npn'
      ORDER BY
        CASE status
          WHEN 'converted' THEN 1
          WHEN 'committing' THEN 2
          WHEN 'scheduled' THEN 3
          WHEN 'sent' THEN 4
          WHEN 'follow_up_2' THEN 5
          WHEN 'follow_up_1' THEN 6
          WHEN 'survey_sent' THEN 7
          WHEN 'approved' THEN 8
          WHEN 'reviewed' THEN 9
          WHEN 'drafted' THEN 10
          WHEN 'held' THEN 11
          WHEN 'pending' THEN 12
          ELSE 13
        END,
        updated_at DESC NULLS LAST,
        created_at ASC,
        id ASC
    ) AS duplicate_rank
  FROM recruitment_prospects
  WHERE properties->>'npn' IS NOT NULL
    AND status NOT IN ('rejected', 'opted_out', 'follow_up_exhausted', 'converted')
)
UPDATE recruitment_prospects AS prospect
SET
  status = 'rejected',
  qa_rejection_reason = 'duplicate_licensee_npn',
  properties = prospect.properties || jsonb_build_object(
    'deduplicated_at', now(),
    'deduplication_reason', 'duplicate_licensee_npn'
  ),
  updated_at = now()
FROM ranked_duplicates
WHERE prospect.id = ranked_duplicates.id
  AND ranked_duplicates.duplicate_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_recruitment_prospects_active_npn
  ON recruitment_prospects ((properties->>'npn'))
  WHERE properties->>'npn' IS NOT NULL
    AND status NOT IN ('rejected', 'opted_out', 'follow_up_exhausted', 'converted');