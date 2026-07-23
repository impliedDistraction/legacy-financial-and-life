-- Credit events are a client-value ledger, not merely an Apollo reveal log.
-- The extra fields are nullable so historical transactions remain valid.
ALTER TABLE apollo_credit_transactions
  ADD COLUMN IF NOT EXISTS stage text,
  ADD COLUMN IF NOT EXISTS outcome text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS idempotency_key text;

ALTER TABLE apollo_credit_transactions
  ADD CONSTRAINT apollo_credit_transactions_stage_check
  CHECK (stage IS NULL OR stage IN ('reveal', 'research', 'draft', 'qa', 'send', 'voice', 'follow_up', 'survey', 'wallet'));

ALTER TABLE apollo_credit_transactions
  ADD CONSTRAINT apollo_credit_transactions_outcome_check
  CHECK (outcome IS NULL OR outcome IN ('success', 'failed', 'rejected', 'refunded', 'granted', 'purchased', 'adjusted'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_transactions_idempotency
  ON apollo_credit_transactions (wallet_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_credit_transactions_stage_created
  ON apollo_credit_transactions (wallet_id, stage, created_at DESC);

-- Applies one balanced wallet change under a row lock. Reusing an idempotency
-- key returns the original event instead of charging the client twice.
CREATE OR REPLACE FUNCTION apply_credit_transaction(
  p_client_slug text,
  p_amount integer,
  p_type text,
  p_description text DEFAULT NULL,
  p_campaign_id uuid DEFAULT NULL,
  p_prospect_id uuid DEFAULT NULL,
  p_payment_reference text DEFAULT NULL,
  p_stage text DEFAULT NULL,
  p_outcome text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_idempotency_key text DEFAULT NULL
)
RETURNS TABLE (
  success boolean,
  balance_after integer,
  is_low boolean,
  is_zero boolean,
  transaction_id uuid,
  idempotent boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  wallet apollo_credit_wallets%ROWTYPE;
  existing apollo_credit_transactions%ROWTYPE;
  next_balance integer;
  transaction apollo_credit_transactions%ROWTYPE;
BEGIN
  SELECT * INTO wallet
  FROM apollo_credit_wallets
  WHERE client_slug = p_client_slug
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Credit wallet not found for client %', p_client_slug;
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO existing
    FROM apollo_credit_transactions
    WHERE wallet_id = wallet.id AND idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN QUERY SELECT true, existing.balance_after,
        existing.balance_after <= wallet.low_balance_threshold,
        existing.balance_after <= 0, existing.id, true;
      RETURN;
    END IF;
  END IF;

  next_balance := wallet.balance + p_amount;
  IF next_balance < 0 THEN
    RETURN QUERY SELECT false, wallet.balance,
      wallet.balance <= wallet.low_balance_threshold,
      wallet.balance <= 0, NULL::uuid, false;
    RETURN;
  END IF;

  UPDATE apollo_credit_wallets
  SET balance = next_balance,
      lifetime_used = lifetime_used + GREATEST(-p_amount, 0),
      lifetime_purchased = lifetime_purchased + GREATEST(p_amount, 0),
      updated_at = now()
  WHERE id = wallet.id;

  INSERT INTO apollo_credit_transactions (
    wallet_id, type, amount, balance_after, description, campaign_id,
    prospect_id, payment_reference, stage, outcome, metadata, idempotency_key
  ) VALUES (
    wallet.id, p_type, p_amount, next_balance, p_description, p_campaign_id,
    p_prospect_id, p_payment_reference, p_stage, p_outcome,
    COALESCE(p_metadata, '{}'::jsonb), p_idempotency_key
  ) RETURNING * INTO transaction;

  RETURN QUERY SELECT true, next_balance,
    next_balance <= wallet.low_balance_threshold,
    next_balance <= 0, transaction.id, false;
END;
$$;

REVOKE ALL ON FUNCTION apply_credit_transaction FROM PUBLIC;
GRANT EXECUTE ON FUNCTION apply_credit_transaction TO service_role;

COMMENT ON FUNCTION apply_credit_transaction IS 'Atomically applies an idempotent credit ledger event and wallet balance update.';