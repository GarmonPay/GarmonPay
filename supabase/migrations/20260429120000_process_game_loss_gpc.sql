-- Canonical atomic GPay Coin (GPC) loss: users.gpay_coins + coin_transactions in one transaction.
-- Game stakes (Coin Flip, C-Lo, Station, etc.) use GPC — NOT public.wallet_ledger (USD cents).
-- p_amount_cents is a legacy name: value is GPC minor units (users.gpay_coins), same integer scale as before.

CREATE OR REPLACE FUNCTION public.process_game_loss(
  p_user_id uuid,
  p_amount_cents integer,
  p_reference text,
  p_description text DEFAULT NULL,
  p_ledger_type text DEFAULT 'game_loss'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_desc text;
  v_type text;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'user_id required');
  END IF;
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid amount');
  END IF;
  IF p_reference IS NULL OR trim(p_reference) = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'reference required');
  END IF;

  v_desc := COALESCE(NULLIF(trim(p_description), ''), 'Game loss');
  v_type := COALESCE(NULLIF(trim(p_ledger_type), ''), 'game_loss');

  IF EXISTS (SELECT 1 FROM public.coin_transactions WHERE reference = p_reference) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Duplicate transaction');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'User not found');
  END IF;

  UPDATE public.users u
  SET gpay_coins = u.gpay_coins - p_amount_cents
  WHERE u.id = p_user_id
    AND u.gpay_coins >= p_amount_cents;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Insufficient gpay coins');
  END IF;

  INSERT INTO public.coin_transactions (user_id, type, gold_coins, gpay_coins, description, reference)
  VALUES (
    p_user_id,
    v_type,
    0,
    -p_amount_cents,
    v_desc,
    p_reference
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION public.process_game_loss(uuid, integer, text, text, text)
  IS 'Atomically debits GPC (users.gpay_coins) and appends coin_transactions. Amount is GPC minor units.';

GRANT EXECUTE ON FUNCTION public.process_game_loss(uuid, integer, text, text, text) TO service_role;

-- Backward-compatible name: same RPC apps already call via lib/coins.ts
CREATE OR REPLACE FUNCTION public.debit_gpay_coins_with_ledger(
  p_user_id uuid,
  p_amount integer,
  p_type text,
  p_description text,
  p_reference text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.process_game_loss(
    p_user_id,
    p_amount,
    p_reference,
    p_description,
    COALESCE(NULLIF(trim(p_type), ''), 'debit')
  );
END;
$$;

COMMENT ON FUNCTION public.debit_gpay_coins_with_ledger(uuid, integer, text, text, text)
  IS 'Wrapper around process_game_loss for existing callers (custom ledger type + description).';

-- Note: No broad INSERT policy on public.wallet_ledger for authenticated users — that would allow
-- forged credits. USD wallet changes must go through public.wallet_ledger_entry (SECURITY DEFINER).
