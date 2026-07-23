-- Campaign enrichment effectiveness and operational review audit trail.
-- This schema is intentionally provider-neutral so Sentinel can report DOI,
-- Brave/rescue, Apollo, or future Fieldwork enrichment providers consistently.

CREATE TABLE IF NOT EXISTS campaign_enrichment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_slug text NOT NULL DEFAULT 'legacy-financial',
  campaign_id uuid NOT NULL REFERENCES recruitment_campaigns(id) ON DELETE CASCADE,
  prospect_id uuid REFERENCES recruitment_prospects(id) ON DELETE SET NULL,
  provider text NOT NULL CHECK (provider IN ('doi', 'brave_rescue', 'apollo', 'manual', 'other')),
  operation text NOT NULL CHECK (operation IN ('lookup', 'rescue', 'reveal', 'import')),
  outcome text NOT NULL CHECK (outcome IN ('enriched', 'no_match', 'skipped', 'failed')),
  fields_added text[] NOT NULL DEFAULT '{}'::text[],
  cost_cents integer NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
  failure_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_enrichment_events_campaign
  ON campaign_enrichment_events (campaign_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_enrichment_events_provider
  ON campaign_enrichment_events (provider, outcome, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_enrichment_events_prospect
  ON campaign_enrichment_events (prospect_id, occurred_at DESC)
  WHERE prospect_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS recruitment_campaign_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES recruitment_campaigns(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('delete_rejected', 'reset_review_queue', 'create_rescue_add_on')),
  affected_count integer NOT NULL DEFAULT 0 CHECK (affected_count >= 0),
  actor_email text,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recruitment_campaign_operations_campaign
  ON recruitment_campaign_operations (campaign_id, occurred_at DESC);

CREATE OR REPLACE VIEW campaign_enrichment_summary
WITH (security_invoker = true) AS
SELECT
  event.campaign_id,
  event.provider,
  count(*) AS attempt_count,
  count(*) FILTER (WHERE event.outcome = 'enriched') AS enriched_count,
  count(*) FILTER (WHERE event.outcome = 'no_match') AS no_match_count,
  count(*) FILTER (WHERE event.outcome = 'failed') AS failed_count,
  count(*) FILTER (WHERE 'email' = ANY(event.fields_added)) AS email_found_count,
  count(*) FILTER (WHERE prospect.status IN ('sent', 'follow_up_1', 'follow_up_2', 'scheduled', 'booked', 'converted')) AS deliverable_count,
  count(*) FILTER (WHERE prospect.status IN ('scheduled', 'booked', 'converted')) AS conversion_count,
  COALESCE(sum(event.cost_cents), 0) AS cost_cents,
  max(event.occurred_at) AS latest_enriched_at
FROM campaign_enrichment_events event
LEFT JOIN recruitment_prospects prospect ON prospect.id = event.prospect_id
GROUP BY event.campaign_id, event.provider;

ALTER TABLE campaign_enrichment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE recruitment_campaign_operations ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE campaign_enrichment_events IS 'Provider-neutral enrichment attempts and observed downstream campaign performance.';
COMMENT ON TABLE recruitment_campaign_operations IS 'Auditable dashboard cleanup, reset, and add-on campaign operations.';
