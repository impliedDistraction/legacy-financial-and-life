-- Formal campaign return tracking for recruitment and sales campaigns.
-- A campaign declares one primary return type; observed outcomes are written to
-- campaign_returns so engagement, appointments, and realized business value can
-- be measured without overloading a prospect's lifecycle status.

ALTER TABLE recruitment_campaigns
  ADD COLUMN IF NOT EXISTS primary_return_type text NOT NULL DEFAULT 'recruitment_conversion'
  CHECK (primary_return_type IN (
    'content_engagement', 'appointment', 'quote_request', 'quote_issued',
    'policy_bound', 'recruitment_commitment', 'recruitment_conversion'
  ));

ALTER TABLE sales_campaigns
  ADD COLUMN IF NOT EXISTS primary_return_type text NOT NULL DEFAULT 'quote_request'
  CHECK (primary_return_type IN (
    'content_engagement', 'appointment', 'quote_request', 'quote_issued',
    'policy_bound', 'recruitment_commitment', 'recruitment_conversion'
  ));

CREATE TABLE IF NOT EXISTS campaign_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_kind text NOT NULL CHECK (campaign_kind IN ('recruitment', 'sales')),
  recruitment_campaign_id uuid REFERENCES recruitment_campaigns(id) ON DELETE CASCADE,
  sales_campaign_id uuid REFERENCES sales_campaigns(id) ON DELETE CASCADE,
  prospect_id uuid REFERENCES recruitment_prospects(id) ON DELETE SET NULL,
  return_type text NOT NULL CHECK (return_type IN (
    'content_engagement', 'appointment', 'quote_request', 'quote_issued',
    'policy_bound', 'recruitment_commitment', 'recruitment_conversion'
  )),
  return_status text NOT NULL DEFAULT 'observed'
    CHECK (return_status IN ('observed', 'qualified', 'realized', 'reversed')),
  return_value_cents integer NOT NULL DEFAULT 0 CHECK (return_value_cents >= 0),
  source text NOT NULL DEFAULT 'system'
    CHECK (source IN ('webhook', 'calendly', 'manual', 'system', 'import')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_returns_exactly_one_campaign CHECK (
    (campaign_kind = 'recruitment' AND recruitment_campaign_id IS NOT NULL AND sales_campaign_id IS NULL)
    OR
    (campaign_kind = 'sales' AND sales_campaign_id IS NOT NULL AND recruitment_campaign_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_campaign_returns_recruitment
  ON campaign_returns (recruitment_campaign_id, occurred_at DESC)
  WHERE recruitment_campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_campaign_returns_sales
  ON campaign_returns (sales_campaign_id, occurred_at DESC)
  WHERE sales_campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_campaign_returns_prospect
  ON campaign_returns (prospect_id, occurred_at DESC)
  WHERE prospect_id IS NOT NULL;

ALTER TABLE campaign_returns ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE VIEW campaign_return_summary
WITH (security_invoker = true) AS
WITH campaign_catalog AS (
  SELECT 'recruitment'::text AS campaign_kind, id AS campaign_id, primary_return_type
  FROM recruitment_campaigns
  UNION ALL
  SELECT 'sales'::text AS campaign_kind, id AS campaign_id, primary_return_type
  FROM sales_campaigns
), return_rollup AS (
  SELECT
    campaign_kind,
    COALESCE(recruitment_campaign_id, sales_campaign_id) AS campaign_id,
    count(*) AS return_count,
    count(*) FILTER (WHERE return_status = 'realized') AS realized_return_count,
    COALESCE(sum(return_value_cents) FILTER (WHERE return_status = 'realized'), 0) AS realized_value_cents,
    max(occurred_at) AS latest_return_at
  FROM campaign_returns
  GROUP BY campaign_kind, COALESCE(recruitment_campaign_id, sales_campaign_id)
)
SELECT
  c.campaign_kind,
  c.campaign_id,
  c.primary_return_type,
  COALESCE(r.return_count, 0) AS return_count,
  COALESCE(r.realized_return_count, 0) AS realized_return_count,
  COALESCE(r.realized_value_cents, 0) AS realized_value_cents,
  r.latest_return_at
FROM campaign_catalog c
LEFT JOIN return_rollup r
  ON r.campaign_kind = c.campaign_kind AND r.campaign_id = c.campaign_id;

COMMENT ON TABLE campaign_returns IS 'Attributed campaign outcomes, kept separate from prospect lifecycle states for consistent return measurement.';
COMMENT ON COLUMN recruitment_campaigns.primary_return_type IS 'The outcome this recruitment campaign is primarily optimized to create.';
COMMENT ON COLUMN sales_campaigns.primary_return_type IS 'The outcome this sales campaign is primarily optimized to create.';