-- Ensure all tables and columns required by admin, Stripe, and ads exist.
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS.

-- users: ensure stripe-related and profile columns
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS balance numeric DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role text DEFAULT 'user';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_super_admin boolean DEFAULT false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- deposits: stripe_session for Stripe webhook
ALTER TABLE public.deposits ADD COLUMN IF NOT EXISTS stripe_session text;

-- transactions: status, description, reference_id for withdrawals/deposits
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending';
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS reference_id text;

-- withdrawals: add platform_fee if missing (admin revenue stats)
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS platform_fee numeric DEFAULT 0;

-- platform_revenue (admin stats)
CREATE TABLE IF NOT EXISTS public.platform_revenue (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  amount numeric DEFAULT 0,
  source text,
  created_at timestamptz DEFAULT now()
);

-- profit (admin stats)
CREATE TABLE IF NOT EXISTS public.profit (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  amount numeric DEFAULT 0,
  source text,
  created_at timestamptz DEFAULT now()
);

-- revenue_transactions (Stripe webhook optional)
CREATE TABLE IF NOT EXISTS public.revenue_transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text,
  amount numeric DEFAULT 0,
  type text,
  created_at timestamptz DEFAULT now()
);

-- ads: video_url, image_url, user_id, budget for video ad section
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS video_url text;
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS budget numeric DEFAULT 0;
