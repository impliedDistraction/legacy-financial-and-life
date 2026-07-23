-- Immutable lifecycle history for detailed campaign results and customer review.

CREATE TABLE IF NOT EXISTS recruitment_pipeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES recruitment_prospects(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES recruitment_campaigns(id) ON DELETE SET NULL,
  from_status text,
  to_status text NOT NULL,
  reason text,
  actor text NOT NULL DEFAULT 'system',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recruitment_pipeline_events_campaign
  ON recruitment_pipeline_events (campaign_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_recruitment_pipeline_events_prospect
  ON recruitment_pipeline_events (prospect_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION record_recruitment_pipeline_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  event_reason text;
  event_actor text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO recruitment_pipeline_events (prospect_id, campaign_id, from_status, to_status, reason, actor, metadata)
    VALUES (NEW.id, NEW.campaign_id, NULL, COALESCE(NEW.status, 'pending'), 'Prospect imported into campaign', 'import', jsonb_build_object('source', NEW.source));
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    event_reason := CASE
      WHEN NEW.status = 'rejected' THEN COALESCE(NEW.qa_rejection_reason, NEW.properties->>'rejection_reason', 'Rejected during review')
      WHEN NEW.status = 'held' THEN COALESCE(NEW.properties->>'held_reason', NEW.properties->>'agent_reasons', 'Held for review')
      WHEN NEW.status = 'reviewed' THEN CONCAT('QA passed', CASE WHEN NEW.qa_score IS NOT NULL THEN ' (score ' || NEW.qa_score || ')' ELSE '' END)
      WHEN NEW.status = 'approved' THEN COALESCE(NEW.properties->>'agent_reasons', 'Approved for delivery review')
      WHEN NEW.status = 'pending' AND OLD.status IN ('drafted', 'reviewed', 'approved', 'rejected') THEN 'Returned to pending for a clean review cycle'
      WHEN NEW.status = 'sent' THEN 'Delivered outreach'
      ELSE NULL
    END;
    event_actor := COALESCE(NEW.properties->>'held_by', NEW.properties->>'reviewed_by', 'system');
    INSERT INTO recruitment_pipeline_events (prospect_id, campaign_id, from_status, to_status, reason, actor, metadata)
    VALUES (
      NEW.id, NEW.campaign_id, OLD.status, NEW.status, event_reason, event_actor,
      jsonb_build_object('qa_score', NEW.qa_score, 'fit_score', NEW.fit_score, 'interaction_stage', NEW.interaction_stage)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recruitment_pipeline_event_trigger ON recruitment_prospects;
CREATE TRIGGER recruitment_pipeline_event_trigger
AFTER INSERT OR UPDATE OF status ON recruitment_prospects
FOR EACH ROW EXECUTE FUNCTION record_recruitment_pipeline_event();

ALTER TABLE recruitment_pipeline_events ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE recruitment_pipeline_events IS 'Immutable reasoned lifecycle movements for recruitment prospects.';
