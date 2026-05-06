-- Ensure PostgREST can invoke membership purchase RPC and schema is stable.
-- Replaces any 3-arg overload with a single 4-arg form (4th param optional for renewals).

DROP FUNCTION IF EXISTS public.purchase_membership_with_balance_v2(uuid, text, integer);

CREATE OR REPLACE FUNCTION public.purchase_membership_with_balance_v2(
  p_user_id uuid,
  p_tier text,
  p_price_gc integer,
  p_extend_from timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_gold integer;
  v_period_end timestamptz;
BEGIN
  IF p_tier NOT IN ('starter', 'growth', 'pro', 'elite') THEN
    RAISE EXCEPTION 'Invalid tier: %', p_tier;
  END IF;
  IF p_price_gc <= 0 THEN
    RAISE EXCEPTION 'Price must be positive';
  END IF;

  IF p_extend_from IS NULL THEN
    v_period_end := now() + interval '1 month';
  ELSE
    v_period_end := greatest(now(), p_extend_from) + interval '1 month';
  END IF;

  SELECT gold_coins INTO v_current_gold
  FROM public.users WHERE id = p_user_id FOR UPDATE;

  IF v_current_gold IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF v_current_gold < p_price_gc THEN
    RAISE EXCEPTION 'Insufficient gold coins (have %, need %)', v_current_gold, p_price_gc;
  END IF;

  UPDATE public.users
  SET gold_coins = gold_coins - p_price_gc,
      membership = p_tier,
      membership_tier = p_tier,
      membership_started_at = COALESCE(membership_started_at, now()),
      membership_period_end = v_period_end,
      membership_expires_at = v_period_end,
      membership_payment_source = 'balance',
      stripe_subscription_id = null,
      subscription_status = 'active',
      updated_at = now()
  WHERE id = p_user_id
  RETURNING membership_period_end INTO v_period_end;

  INSERT INTO public.membership_purchases (user_id, tier, price_gc, payment_method, period_end, created_at)
  VALUES (p_user_id, p_tier, p_price_gc, 'balance', v_period_end, now());

  RETURN jsonb_build_object(
    'success', true,
    'tier', p_tier,
    'price_gc', p_price_gc,
    'remaining_gold', v_current_gold - p_price_gc,
    'period_end', v_period_end
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_membership_with_balance_v2(uuid, text, integer, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purchase_membership_with_balance_v2(uuid, text, integer, timestamptz) TO anon;
GRANT EXECUTE ON FUNCTION public.purchase_membership_with_balance_v2(uuid, text, integer, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_membership_with_balance_v2(uuid, text, integer, timestamptz) TO service_role;

COMMENT ON FUNCTION public.purchase_membership_with_balance_v2(uuid, text, integer, timestamptz) IS
  'Debit gold_coins and activate membership. p_extend_from: for renewals, period end = greatest(now(), p_extend_from) + 1 month; else now() + 1 month.';
