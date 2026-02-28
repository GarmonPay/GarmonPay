-- MASTER FIX FOR GARMONPAY
-- Idempotent: safe to run multiple times (drops policies before recreate, ADD COLUMN IF NOT EXISTS).

-- 1. Add missing balance column
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS balance numeric DEFAULT 0;

-- 2. Add created_at and role (needed for sync in step 6)
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS role text DEFAULT 'user';

-- 3. Create deposits table
CREATE TABLE IF NOT EXISTS public.deposits (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  amount numeric DEFAULT 0,
  status text DEFAULT 'completed',
  created_at timestamp with time zone DEFAULT now()
);

-- 4. Create transactions table (minimal; other migrations may add status, description, reference_id)
CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  amount numeric DEFAULT 0,
  type text,
  created_at timestamp with time zone DEFAULT now()
);

-- 5. Fix existing users balance
UPDATE public.users
SET balance = 0
WHERE balance IS NULL;

-- 6. Sync auth.users into public.users
INSERT INTO public.users (id, email, role, created_at, balance)
SELECT
  au.id,
  au.email,
  'user',
  now(),
  0
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.users pu WHERE pu.id = au.id
)
ON CONFLICT (id) DO NOTHING;

-- 7. Enable read access (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- 8. Allow full access (drop first so migration is idempotent)
DROP POLICY IF EXISTS "Allow all access" ON public.users;
CREATE POLICY "Allow all access"
ON public.users
FOR ALL
USING (true);

DROP POLICY IF EXISTS "Allow deposits access" ON public.deposits;
CREATE POLICY "Allow deposits access"
ON public.deposits
FOR ALL
USING (true);

DROP POLICY IF EXISTS "Allow transactions access" ON public.transactions;
CREATE POLICY "Allow transactions access"
ON public.transactions
FOR ALL
USING (true);
