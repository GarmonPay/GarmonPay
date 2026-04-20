-- Atomically apply public.credit_coins + coin_transactions row (same transaction as process_game_loss).

CREATE OR REPLACE FUNCTION public.credit_coins_with_ledger(
  p_user_id uuid,
  p_gold_coins integer,
  p_gpay_coins integer,
  p_type text,
  p_description text,
  p_reference text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_g integer := COALESCE(p_gold_coins, 0);
  v_s integer := COALESCE(p_gpay_coins, 0);
  v_type text;
  v_desc text;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'user_id required');
  END IF;
  IF v_g = 0 AND v_s = 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Amount cannot be zero');
  END IF;
  IF p_reference IS NULL OR trim(p_reference) = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'reference required');
  END IF;

  IF EXISTS (SELECT 1 FROM public.coin_transactions WHERE reference = p_reference) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Duplicate transaction');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'User not found');
  END IF;

  v_type := COALESCE(NULLIF(trim(p_type), ''), 'credit');
  v_desc := COALESCE(NULLIF(trim(p_description), ''), 'Credit');

  PERFORM public.credit_coins(p_user_id, v_g, v_s);

  INSERT INTO public.coin_transactions (user_id, type, gold_coins, gpay_coins, description, reference)
  VALUES (p_user_id, v_type, v_g, v_s, v_desc, p_reference);

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION public.credit_coins_with_ledger(uuid, integer, integer, text, text, text)
  IS 'Atomically credits users (credit_coins) and appends coin_transactions.';

GRANT EXECUTE ON FUNCTION public.credit_coins_with_ledger(uuid, integer, integer, text, text, text) TO service_role;
