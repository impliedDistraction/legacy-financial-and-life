-- ═══════════════════════════════════════════════════════════════════
-- Performance RPCs & Indexes — reduce query count on Micro instance
-- Run in Supabase SQL Editor (Legacy Financial: kxmojndpgxgbykxjtxba)
-- ═══════════════════════════════════════════════════════════════════


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 1. Engagement stats — replaces 12 parallel count queries        │
-- └─────────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION recruitment_engagement_stats()
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT jsonb_build_object(
    'sent', count(*) FILTER (WHERE status IN ('sent','converted','scheduled','follow_up_1','follow_up_2','follow_up_exhausted')),
    'opened', count(*) FILTER (WHERE status IN ('sent','converted','scheduled','follow_up_1','follow_up_2','follow_up_exhausted') AND properties->>'email_opened_at' IS NOT NULL),
    'clicked', count(*) FILTER (WHERE status IN ('sent','converted','scheduled','follow_up_1','follow_up_2','follow_up_exhausted') AND properties->>'email_clicked_at' IS NOT NULL),
    'visited', count(*) FILTER (WHERE status IN ('sent','converted','scheduled','follow_up_1','follow_up_2','follow_up_exhausted') AND properties->>'join_page_visited_at' IS NOT NULL),
    'chatted', count(*) FILTER (WHERE status IN ('sent','converted','scheduled','follow_up_1','follow_up_2','follow_up_exhausted') AND properties->>'chat_session_id' IS NOT NULL),
    'interested', count(*) FILTER (WHERE status IN ('sent','converted','scheduled','follow_up_1','follow_up_2','follow_up_exhausted') AND interaction_stage = 'interested'),
    'replied', count(*) FILTER (WHERE status IN ('sent','converted','scheduled','follow_up_1','follow_up_2','follow_up_exhausted') AND properties->>'email_replied_at' IS NOT NULL),
    'scheduled', count(*) FILTER (WHERE status = 'scheduled'),
    'converted', count(*) FILTER (WHERE status = 'converted'),
    'bounced', count(*) FILTER (WHERE status = 'bounced'),
    'follow_up', count(*) FILTER (WHERE status IN ('follow_up_1','follow_up_2')),
    'no_response', count(*) FILTER (WHERE status = 'follow_up_exhausted')
  )
  FROM recruitment_prospects;
$$;

COMMENT ON FUNCTION recruitment_engagement_stats() IS
  'Single-scan aggregate of all engagement metrics. Replaces 12 parallel REST queries.';


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 2. Send pacing stats — replaces 4 queries per cron loop         │
-- └─────────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION send_pacing_stats(p_start_of_day timestamptz, p_start_of_hour timestamptz)
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT jsonb_build_object(
    'today', count(*) FILTER (WHERE status = 'sent' AND sent_at >= p_start_of_day),
    'this_hour', count(*) FILTER (WHERE status = 'sent' AND sent_at >= p_start_of_hour),
    'last_sent', (SELECT max(sent_at) FROM recruitment_prospects WHERE status = 'sent' AND sent_at IS NOT NULL),
    'approved_queue', count(*) FILTER (WHERE status = 'approved' AND sent_at IS NULL AND email IS NOT NULL)
  )
  FROM recruitment_prospects;
$$;

COMMENT ON FUNCTION send_pacing_stats(timestamptz, timestamptz) IS
  'Combined pacing metrics in a single scan. Called every 90s by cron.';


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 3. Campaign send counts — replaces N+1 per-campaign counting    │
-- └─────────────────────────────────────────────────────────────────┘

CREATE OR REPLACE FUNCTION campaign_send_counts()
RETURNS TABLE (campaign_id uuid, sent_count bigint)
LANGUAGE sql STABLE
AS $$
  SELECT campaign_id, count(*)
  FROM recruitment_prospects
  WHERE campaign_id IS NOT NULL
    AND status IN ('sent','bounced','follow_up_1','follow_up_2','follow_up_exhausted')
    AND sent_at IS NOT NULL
  GROUP BY campaign_id;
$$;

COMMENT ON FUNCTION campaign_send_counts() IS
  'Batch campaign send totals. Replaces per-campaign count loop in cron.';


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 4. Expression indexes on JSONB properties used in stats         │
-- └─────────────────────────────────────────────────────────────────┘

-- These allow Postgres to use index-only scans instead of seq-scanning properties
CREATE INDEX IF NOT EXISTS idx_prospects_props_opened
  ON recruitment_prospects ((properties->>'email_opened_at'))
  WHERE properties->>'email_opened_at' IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_prospects_props_clicked
  ON recruitment_prospects ((properties->>'email_clicked_at'))
  WHERE properties->>'email_clicked_at' IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_prospects_props_visited
  ON recruitment_prospects ((properties->>'join_page_visited_at'))
  WHERE properties->>'join_page_visited_at' IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_prospects_props_chatted
  ON recruitment_prospects ((properties->>'chat_session_id'))
  WHERE properties->>'chat_session_id' IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_prospects_props_replied
  ON recruitment_prospects ((properties->>'email_replied_at'))
  WHERE properties->>'email_replied_at' IS NOT NULL;


-- ┌─────────────────────────────────────────────────────────────────┐
-- │ 5. TTL cleanup function for lead_flow_events                    │
-- └─────────────────────────────────────────────────────────────────┘
-- Call manually or set up pg_cron: SELECT cleanup_old_lead_events(90);

CREATE OR REPLACE FUNCTION cleanup_old_lead_events(p_days integer DEFAULT 90)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count bigint;
BEGIN
  DELETE FROM lead_flow_events
  WHERE occurred_at < now() - (p_days || ' days')::interval;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION cleanup_old_lead_events(integer) IS
  'Deletes lead_flow_events older than N days. Default 90. Call monthly.';
