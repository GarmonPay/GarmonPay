-- Ensure public.users exists before migrations that ALTER it (e.g. 20260401000000_fix_signup_trigger).
-- Without this, databases that never applied early base migrations fail with:
--   ERROR: relation "public.users" does not exist
--
-- Idempotent: CREATE TABLE IF NOT EXISTS only runs when the table is missing.

CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'user',
  membership text NOT NULL DEFAULT 'free',
  balance numeric NOT NULL DEFAULT 0,
  balance_cents integer NOT NULL DEFAULT 0,
  referral_code text,
  referred_by uuid,
  referred_by_code text,
  full_name text DEFAULT '',
  avatar_url text DEFAULT '',
  is_super_admin boolean NOT NULL DEFAULT false,
  registration_ip text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_email_idx ON public.users (email);
