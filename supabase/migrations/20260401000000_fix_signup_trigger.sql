-- =============================================================================
-- FIX: "Database error saving new user" on signup
--
-- Root cause: generate_referral_code() trigger only generates 65,536 unique
-- codes ('GARM-' + 4 hex chars). With 10k+ users this collides with the
-- UNIQUE constraint on referral_code, causing the auth.users INSERT to roll
-- back, surfacing "Database error saving new user" to the client.
--
-- Fixes:
--   1. Drop the short-code BEFORE INSERT trigger and replace handle_new_user()
--      with a version that generates a longer unique referral code with a retry
--      loop and wraps the whole INSERT in EXCEPTION WHEN OTHERS so auth signup
--      can never be blocked by a profile insert failure.
--   2. Ensure all expected columns exist (idempotent ADD COLUMN IF NOT EXISTS).
--   3. Expand the membership check constraint to include 'free'.
--   4. Ensure correct RLS policies for authenticated + service_role.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- STEP 1: Ensure every column used by handle_new_user() and sync-user exists
-- ---------------------------------------------------------------------------
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS balance         numeric       DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS balance_cents   integer       DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role            text          DEFAULT 'user';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS membership      text          DEFAULT 'free';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_super_admin  boolean       DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS referral_code   text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS referred_by     uuid;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS referred_by_code text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS full_name       text          DEFAULT '';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_url      text          DEFAULT '';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS registration_ip text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS created_at      timestamptz   DEFAULT now();
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at      timestamptz   DEFAULT now();

-- Make referral_code unique (safe if index already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'users' AND indexname = 'users_referral_code_key'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass AND contype = 'u'
      AND conname = 'users_referral_code_key'
  ) THEN
    -- Only add if there are no duplicate values currently
    BEGIN
      ALTER TABLE public.users ADD CONSTRAINT users_referral_code_key UNIQUE (referral_code);
    EXCEPTION WHEN OTHERS THEN
      RAISE LOG 'Could not add UNIQUE constraint on referral_code (duplicates may exist): %', SQLERRM;
    END;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- STEP 2: Expand membership check constraint to include 'free'
-- ---------------------------------------------------------------------------
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_membership_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_membership_check
  CHECK (membership IN ('free', 'starter', 'growth', 'pro', 'elite', 'vip', 'active'));
ALTER TABLE public.users ALTER COLUMN membership SET DEFAULT 'free';

-- ---------------------------------------------------------------------------
-- STEP 3: Drop the short-code BEFORE INSERT trigger — it is the collision bug
-- ---------------------------------------------------------------------------
DROP TRIGGER  IF EXISTS set_referral_code    ON public.users;
DROP FUNCTION IF EXISTS generate_referral_code();

-- ---------------------------------------------------------------------------
-- STEP 4: Replace handle_new_user() with a safe version
--   • Generates an 8-char unique referral code (gen_random_uuid, upper hex)
--     with a WHILE loop to guarantee no collisions.
--   • EXCEPTION WHEN OTHERS: logs the error but always returns NEW so that
--     auth.users INSERT succeeds and the user can actually sign in.
--   • ON CONFLICT (id) DO NOTHING: idempotent if somehow called twice.
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
  -- Generate a unique 8-char referral code with retry loop
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

  RETURN new;
EXCEPTION
  WHEN OTHERS THEN
    -- Log but never block auth signup
    RAISE LOG 'handle_new_user error for user %: %', new.id, SQLERRM;
    RETURN new;
END;
$$;

-- Recreate the trigger (drop first so this migration is idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

COMMENT ON FUNCTION public.handle_new_user() IS
  'Creates public.users row on new auth signup. Generates a unique 8-char referral code with retry loop. Never blocks auth INSERT (EXCEPTION WHEN OTHERS).';

-- ---------------------------------------------------------------------------
-- STEP 5: Backfill any auth users that are missing a public.users row
-- ---------------------------------------------------------------------------
INSERT INTO public.users (id, email, membership, role, balance, balance_cents, created_at, updated_at)
SELECT
  au.id,
  au.email,
  'free',
  'user',
  0,
  0,
  COALESCE(au.created_at, now()),
  now()
FROM auth.users au
WHERE NOT EXISTS (SELECT 1 FROM public.users pu WHERE pu.id = au.id)
ON CONFLICT (id) DO NOTHING;

-- Backfill missing referral codes for rows without one
DO $$
DECLARE
  rec RECORD;
  code text;
BEGIN
  FOR rec IN SELECT id FROM public.users WHERE referral_code IS NULL LOOP
    code := upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    WHILE EXISTS (SELECT 1 FROM public.users WHERE referral_code = code) LOOP
      code := upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    END LOOP;
    UPDATE public.users SET referral_code = code WHERE id = rec.id;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- STEP 6: Ensure RLS is enabled and correct policies exist
-- ---------------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Remove overly permissive blanket policies from earlier migrations
DROP POLICY IF EXISTS "Allow all access"    ON public.users;
DROP POLICY IF EXISTS "allow_all_users"     ON public.users;

-- Authenticated users can read their own row
DROP POLICY IF EXISTS "Users can read own row"     ON public.users;
DROP POLICY IF EXISTS "Users read own profile"     ON public.users;
CREATE POLICY "Users read own profile"
  ON public.users FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Authenticated users can update their own row
DROP POLICY IF EXISTS "Users can update own row"   ON public.users;
DROP POLICY IF EXISTS "Users update own profile"   ON public.users;
CREATE POLICY "Users update own profile"
  ON public.users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- Service role (API with service key) gets full access
DROP POLICY IF EXISTS "Service role full access"   ON public.users;
CREATE POLICY "Service role full access"
  ON public.users FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
