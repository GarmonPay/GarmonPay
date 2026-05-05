-- Canonical signup trigger: only writes truth currency columns on public.users.
-- Obsoletes legacy signup trigger/functions that wrote to wallet tables and dead balance fields.

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS handle_new_user_signup_gpc_bonus() CASCADE;
DROP FUNCTION IF EXISTS handle_new_user_wallet_balances() CASCADE;
DROP FUNCTION IF EXISTS fix_signup_trigger() CASCADE;
DROP FUNCTION IF EXISTS three_tier_signup() CASCADE;

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (
    id,
    email,
    gpay_coins,
    gold_coins,
    gpay_tokens,
    referral_code,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    50,    -- $0.50 join bonus in GPC (50 GPC = $0.50 at 100 GPC/$1)
    0,
    0,
    upper(substr(md5(NEW.id::text), 1, 8)),
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();
