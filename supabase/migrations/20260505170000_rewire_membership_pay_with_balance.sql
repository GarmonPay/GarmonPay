CREATE TABLE IF NOT EXISTS public.membership_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  tier text NOT NULL,
  price_gc integer NOT NULL,
  payment_method text NOT NULL CHECK (payment_method IN ('balance', 'stripe')),
  period_end timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS membership_tier text DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS membership_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS membership_period_end timestamptz;

-- Atomic membership purchase with gold_coins debit.
CREATE OR REPLACE FUNCTION public.purchase_membership_with_balance_v2(
  p_user_id uuid,
  p_tier text,
  p_price_gc integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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
      membership_period_end = now() + interval '1 month',
      membership_expires_at = now() + interval '1 month',
      membership_payment_source = 'balance',
      stripe_subscription_id = null,
      subscription_status = 'active',
      updated_at = now()
  WHERE id = p_user_id
  RETURNING membership_period_end INTO v_period_end;

  INSERT INTO public.membership_purchases (user_id, tier, price_gc, payment_method, period_end, created_at)
  VALUES (p_user_id, p_tier, p_price_gc, 'balance', v_period_end, now())
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'tier', p_tier,
    'price_gc', p_price_gc,
    'remaining_gold', v_current_gold - p_price_gc,
    'period_end', v_period_end
  );
END;
$$;
