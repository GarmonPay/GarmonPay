-- 100 GPay Coins (sweeps_coins) welcome credit + ledger row for every new auth user.
-- Uses existing public.credit_coins RPC; idempotent reference signup_bonus_<uuid>.

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

    INSERT INTO public.coin_transactions (user_id, type, gold_coins, sweeps_coins, description, reference)
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

COMMENT ON FUNCTION public.handle_new_user() IS
  'Creates public.users + wallet_balances; credits 100 GPay Coins (sweeps_coins) signup bonus + coin_transactions. Never blocks auth INSERT.';
