-- Three-tier coin model: gold_coins (GC), gpay_coins (GPC), gpay_tokens ($GPAY).
-- Renames sweeps_coins → gpay_coins; adds gpay_tokens; new conversion / redemption tables.

-- ---------------------------------------------------------------------------
-- 1. Columns: gpay_tokens; rename sweeps_coins → gpay_coins
-- ---------------------------------------------------------------------------
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS gpay_tokens integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'sweeps_coins'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'gpay_coins'
  ) THEN
    ALTER TABLE public.users RENAME COLUMN sweeps_coins TO gpay_coins;
  END IF;
END $$;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS gpay_coins integer NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 2. coin_transactions: sweeps_coins → gpay_coins
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'coin_transactions' AND column_name = 'sweeps_coins'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'coin_transactions' AND column_name = 'gpay_coins'
  ) THEN
    ALTER TABLE public.coin_transactions RENAME COLUMN sweeps_coins TO gpay_coins;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. gc_packages: bonus_sweeps_coins → bonus_gpay_coins
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'gc_packages' AND column_name = 'bonus_sweeps_coins'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'gc_packages' AND column_name = 'bonus_gpay_coins'
  ) THEN
    ALTER TABLE public.gc_packages RENAME COLUMN bonus_sweeps_coins TO bonus_gpay_coins;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Core RPCs: credit_coins, debit_gpay_coins (replaces debit_sweeps_coins)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.credit_coins(
  p_user_id uuid,
  p_gold_coins integer,
  p_gpay_coins integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.users SET
    gold_coins = COALESCE(gold_coins, 0) + COALESCE(p_gold_coins, 0),
    gpay_coins = COALESCE(gpay_coins, 0) + COALESCE(p_gpay_coins, 0),
    lifetime_gc_purchased = COALESCE(lifetime_gc_purchased, 0) + GREATEST(0, COALESCE(p_gold_coins, 0)),
    lifetime_sc_earned = COALESCE(lifetime_sc_earned, 0) + GREATEST(0, COALESCE(p_gpay_coins, 0))
  WHERE id = p_user_id;
END;
$$;

DROP FUNCTION IF EXISTS public.debit_sweeps_coins(uuid, integer);

CREATE OR REPLACE FUNCTION public.debit_gpay_coins(
  p_user_id uuid,
  p_amount integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bal integer;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;
  SELECT gpay_coins INTO v_bal FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF v_bal IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  IF v_bal < p_amount THEN
    RAISE EXCEPTION 'Insufficient gpay coins';
  END IF;
  UPDATE public.users SET
    gpay_coins = gpay_coins - p_amount
  WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.credit_coins(uuid, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.debit_gpay_coins(uuid, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.credit_gpay_tokens(
  p_user_id uuid,
  p_amount integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;
  UPDATE public.users SET
    gpay_tokens = COALESCE(gpay_tokens, 0) + p_amount
  WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.credit_gpay_tokens(uuid, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.debit_gold_coins(
  p_user_id uuid,
  p_amount integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bal integer;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;
  SELECT gold_coins INTO v_bal FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF v_bal IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  IF v_bal < p_amount THEN
    RAISE EXCEPTION 'Insufficient gold coins';
  END IF;
  UPDATE public.users SET gold_coins = gold_coins - p_amount WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.debit_gold_coins(uuid, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. GC → GPC conversion (atomic)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gc_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  gold_coins_spent integer NOT NULL,
  gpay_coins_received integer NOT NULL,
  conversion_rate numeric NOT NULL,
  membership_tier text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gc_conversions_user_created ON public.gc_conversions (user_id, created_at DESC);

ALTER TABLE public.gc_conversions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own conversions" ON public.gc_conversions;
CREATE POLICY "Users read own conversions"
  ON public.gc_conversions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Inserts performed by SECURITY DEFINER RPC / service role only
DROP POLICY IF EXISTS "Users create conversions" ON public.gc_conversions;

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
    gold_coins,
    gpay_coins,
    lower(trim(coalesce(nullif(trim(membership_tier::text), ''), nullif(trim(membership::text), ''), 'free')))
  INTO v_gold, v_gpay_bal, v_tier
  FROM public.users
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_gold IS NULL THEN
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
    gold_coins = gold_coins - p_amount_gc,
    gpay_coins = gpay_coins + v_gpay,
    lifetime_sc_earned = lifetime_sc_earned + GREATEST(0, v_gpay)
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

GRANT EXECUTE ON FUNCTION public.convert_gold_to_gpay_coins(uuid, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. GPC → $GPAY redemption log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gpay_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  gpay_coins_spent integer NOT NULL,
  gpay_tokens_received integer NOT NULL,
  wallet_address text NOT NULL,
  transaction_signature text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS gpay_redemptions_user_created ON public.gpay_redemptions (user_id, created_at DESC);

ALTER TABLE public.gpay_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own redemptions" ON public.gpay_redemptions;
CREATE POLICY "Users read own redemptions"
  ON public.gpay_redemptions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 7. Signup trigger: ledger column gpay_coins
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_referral_code text;
BEGIN
  new_referral_code := upper(substring(
    replace(gen_random_uuid()::text, '-', ''),
    1, 8
  ));

  WHILE EXISTS (
    SELECT 1 FROM public.users WHERE referral_code = new_referral_code
  ) LOOP
    new_referral_code := upper(substring(
      replace(gen_random_uuid()::text, '-', ''),
      1, 8
    ));
  END LOOP;

  INSERT INTO public.users (
    id,
    email,
    full_name,
    avatar_url,
    referral_code,
    balance,
    balance_cents,
    membership,
    role,
    is_super_admin,
    created_at,
    updated_at
  ) VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', ''),
    COALESCE(new.raw_user_meta_data->>'avatar_url', ''),
    new_referral_code,
    0,
    0,
    'free',
    'user',
    false,
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.wallet_balances (user_id, balance, updated_at)
  VALUES (new.id, 0, now())
  ON CONFLICT (user_id) DO NOTHING;

  IF NOT EXISTS (
    SELECT 1 FROM public.coin_transactions WHERE reference = 'signup_bonus_' || new.id::text
  ) THEN
    PERFORM public.credit_coins(new.id, 0, 100);

    INSERT INTO public.coin_transactions (user_id, type, gold_coins, gpay_coins, description, reference)
    VALUES (
      new.id,
      'signup_bonus',
      0,
      100,
      'Welcome bonus - 100 GPay Coins',
      'signup_bonus_' || new.id::text
    )
    ON CONFLICT (reference) DO NOTHING;
  END IF;

  RETURN new;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'handle_new_user error for user %: %', new.id, SQLERRM;
    RETURN new;
END;
$$;

COMMENT ON FUNCTION public.credit_coins(uuid, integer, integer) IS 'Credits GC and/or GPC (gpay_coins) on users.';
COMMENT ON FUNCTION public.debit_gpay_coins(uuid, integer) IS 'Debits GPay Coins (gpay_coins).';
