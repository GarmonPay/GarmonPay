-- Flat GC→GPC rate: 97 GPC per 1 GC (nominal 100 GPC, 3% platform fee).
-- Replaces tier-based multipliers (0.80–1.00) that incorrectly paid e.g. 0.8 GPC per GC on free tier.

CREATE OR REPLACE FUNCTION public.convert_gold_to_gpay_coins(
  p_user_id uuid,
  p_amount_gc integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier text;
  v_rate numeric := 97; -- GPC per 1 GC (matches app GC_TO_GPC_RATE)
  v_gpay integer;
  v_gold integer;
  v_gpay_bal integer;
BEGIN
  IF p_amount_gc IS NULL OR p_amount_gc < 100 OR p_amount_gc % 100 <> 0 THEN
    RAISE EXCEPTION 'INVALID_GC_AMOUNT';
  END IF;

  SELECT
    COALESCE(gold_coins, 0),
    COALESCE(gpay_coins, 0),
    lower(trim(coalesce(
      nullif(trim(membership_tier::text), ''),
      nullif(trim(membership::text), ''),
      'free'
    )))
  INTO v_gold, v_gpay_bal, v_tier
  FROM public.users
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND';
  END IF;

  IF v_gold < p_amount_gc THEN
    RAISE EXCEPTION 'INSUFFICIENT_GOLD';
  END IF;

  v_gpay := p_amount_gc * 97;

  UPDATE public.users SET
    gold_coins = COALESCE(gold_coins, 0) - p_amount_gc,
    gpay_coins = COALESCE(gpay_coins, 0) + v_gpay,
    lifetime_sc_earned = COALESCE(lifetime_sc_earned, 0) + GREATEST(0, v_gpay)
  WHERE id = p_user_id;

  INSERT INTO public.gc_conversions (user_id, gold_coins_spent, gpay_coins_received, conversion_rate, membership_tier)
  VALUES (p_user_id, p_amount_gc, v_gpay, v_rate, v_tier);

  RETURN jsonb_build_object(
    'gpay_coins_received', v_gpay,
    'conversion_rate', v_rate,
    'membership_tier', v_tier,
    'gpc_fee_amount', p_amount_gc * 3,
    'gpc_nominal_before_fee', p_amount_gc * 100
  );
END;
$$;

COMMENT ON FUNCTION public.convert_gold_to_gpay_coins(uuid, integer) IS
  'Atomic GC→GPC: gpay_coins_received = gold_coins_spent * 97 (3% fee on 100 GPC nominal). conversion_rate stores 97 (GPC per GC).';

COMMENT ON COLUMN public.gc_conversions.conversion_rate IS
  'As of 2026-06-06: GPC credited per 1 GC spent (97). Legacy rows used fractional multipliers applied to ambiguous units.';
