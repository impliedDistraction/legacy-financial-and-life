-- A/B Test Tracking for /join page variants
-- Variant assignment is tracked in:
--   1. lead_flow_events.properties.variant (for each page visit/conversion)
--   2. recruitment_prospects.properties.join_variant (per prospect)
--   3. lfl_join_variant cookie (client-side sticky assignment)
--
-- This migration adds a convenience view for querying A/B test results.

-- View: join page variant performance metrics
CREATE OR REPLACE VIEW join_variant_metrics AS
SELECT
  (properties->>'variant')::text AS variant,
  event_name,
  COUNT(*) AS event_count,
  COUNT(DISTINCT tracking_id) AS unique_visitors,
  DATE_TRUNC('day', occurred_at) AS day
FROM lead_flow_events
WHERE route = '/join'
  AND properties->>'variant' IS NOT NULL
GROUP BY variant, event_name, DATE_TRUNC('day', occurred_at)
ORDER BY day DESC, variant, event_name;

-- Index to speed up variant queries on lead_flow_events
CREATE INDEX IF NOT EXISTS idx_lead_flow_events_join_variant
  ON lead_flow_events ((properties->>'variant'))
  WHERE route = '/join';
