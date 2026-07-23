-- A paused recruitment campaign is a delivery hard stop.
-- This protects the database state even if a worker regresses or a manual API
-- attempts to mark a paused campaign prospect as sent.
CREATE OR REPLACE FUNCTION public.block_paused_recruitment_campaign_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.campaign_id IS NOT NULL
     AND NEW.status = 'sent'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'sent') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.recruitment_campaigns campaign
      WHERE campaign.id = NEW.campaign_id
        AND campaign.status = 'active'
    ) THEN
      RAISE EXCEPTION 'Cannot mark prospect as sent: recruitment campaign % is not active', NEW.campaign_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_paused_recruitment_campaign_delivery_trigger ON public.recruitment_prospects;
CREATE TRIGGER block_paused_recruitment_campaign_delivery_trigger
  BEFORE INSERT OR UPDATE OF status ON public.recruitment_prospects
  FOR EACH ROW
  EXECUTE FUNCTION public.block_paused_recruitment_campaign_delivery();

COMMENT ON FUNCTION public.block_paused_recruitment_campaign_delivery()
  IS 'Prevents paused, completed, or missing recruitment campaigns from transitioning prospects to sent.';
