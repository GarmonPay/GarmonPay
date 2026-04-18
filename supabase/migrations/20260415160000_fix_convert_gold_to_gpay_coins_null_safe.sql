-- Fix GC → GPC conversion: NULL-safe arithmetic on users row.
-- If gold_coins/gpay_coins/lifetime_sc_earned were ever NULL, "x + int" became NULL and violated NOT NULL constraints.

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
  v_rate numeric;
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

  v_rate := CASE v_tier
    WHEN 'elite' THEN 1.00
    WHEN 'vip' THEN 1.00
    WHEN 'pro' THEN 0.95
    WHEN 'growth' THEN 0.90
    WHEN 'starter' THEN 0.85
    WHEN 'free' THEN 0.80
    ELSE 0.80
  END;

  v_gpay := floor(p_amount_gc * v_rate)::integer;

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
    'membership_tier', v_tier
  );
END;
$$;
