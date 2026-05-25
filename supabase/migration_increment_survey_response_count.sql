-- Atomic increment function for survey_campaigns.response_count
-- Avoids race condition when multiple respondents submit simultaneously.
CREATE OR REPLACE FUNCTION increment_survey_response_count(campaign_id_input uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE survey_campaigns
  SET response_count = response_count + 1,
      updated_at = now()
  WHERE id = campaign_id_input;
$$;
