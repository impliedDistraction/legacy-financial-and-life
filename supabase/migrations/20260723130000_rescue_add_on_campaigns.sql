-- Explicit, client-authorized rescue add-ons.
-- Add-ons snapshot the parent campaign's actionable exceptions; they never alter
-- parent records or spend credits until a separate worker is explicitly enabled.

ALTER TABLE recruitment_campaigns
  ADD COLUMN IF NOT EXISTS parent_campaign_id uuid REFERENCES recruitment_campaigns(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_recruitment_campaigns_parent
  ON recruitment_campaigns (parent_campaign_id)
  WHERE parent_campaign_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS recruitment_rescue_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rescue_campaign_id uuid NOT NULL REFERENCES recruitment_campaigns(id) ON DELETE CASCADE,
  source_prospect_id uuid NOT NULL REFERENCES recruitment_prospects(id) ON DELETE CASCADE,
  selection_reason text NOT NULL,
  recommended_strategy text NOT NULL CHECK (recommended_strategy IN (
    'doi_lookup', 'paid_contact_reveal', 'brave_identity_research', 'redraft_only'
  )),
  candidate_status text NOT NULL DEFAULT 'planned' CHECK (candidate_status IN (
    'planned', 'skipped', 'enriched', 'no_match', 'ready_for_draft', 'blocked'
  )),
  provider_used text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  selected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rescue_campaign_id, source_prospect_id)
);

CREATE INDEX IF NOT EXISTS idx_recruitment_rescue_candidates_campaign
  ON recruitment_rescue_candidates (rescue_campaign_id, candidate_status);

ALTER TABLE recruitment_rescue_candidates ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE recruitment_rescue_candidates IS 'Frozen, reasoned candidate selections for a client-authorized rescue add-on.';
COMMENT ON COLUMN recruitment_campaigns.parent_campaign_id IS 'Original campaign from which a rescue add-on was created.';
