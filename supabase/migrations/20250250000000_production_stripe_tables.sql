-- =============================================================================
-- PRODUCTION: Ensure all tables and columns for Stripe deposits and balance.
-- Idempotent. Run in Supabase SQL Editor or: supabase db push
-- Webhook URL: https://garmonpay.com/api/webhooks/stripe
-- =============================================================================

-- 1) public.users (id, email, balance)
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  role text DEFAULT 'user',
  balance numeric DEFAULT 0,
  total_deposits numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS balance numeric DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS total_deposits numeric DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 2) public.transactions (id, user_id, amount, type, status, created_at)
CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  amount numeric DEFAULT 0,
  type text,
  status text DEFAULT 'pending',
  description text,
  reference_id text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending';
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS reference_id text;

-- 3) public.deposits (id, user_id, amount, stripe_session_id, created_at)
CREATE TABLE IF NOT EXISTS public.deposits (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  amount numeric DEFAULT 0,
  status text DEFAULT 'completed',
  stripe_session text,
  stripe_session_id text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.deposits ADD COLUMN IF NOT EXISTS stripe_session text;
ALTER TABLE public.deposits ADD COLUMN IF NOT EXISTS stripe_session_id text;
ALTER TABLE public.deposits ADD COLUMN IF NOT EXISTS status text DEFAULT 'completed';

-- 4) public.stripe_payments (id, user_id, session_id, amount, product_type, created_at)
CREATE TABLE IF NOT EXISTS public.stripe_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  email text,
  amount numeric,
  currency text DEFAULT 'usd',
  product_type text DEFAULT 'payment',
  session_id text,
  stripe_session_id text,
  stripe_payment_intent text,
  stripe_payment_intent_id text,
  status text DEFAULT 'completed',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.stripe_payments ADD COLUMN IF NOT EXISTS session_id text;
ALTER TABLE public.stripe_payments ADD COLUMN IF NOT EXISTS stripe_session_id text;
ALTER TABLE public.stripe_payments ADD COLUMN IF NOT EXISTS amount numeric;
ALTER TABLE public.stripe_payments ADD COLUMN IF NOT EXISTS product_type text DEFAULT 'payment';
ALTER TABLE public.stripe_payments ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.stripe_payments ADD COLUMN IF NOT EXISTS stripe_payment_intent text;
ALTER TABLE public.stripe_payments ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;
ALTER TABLE public.stripe_payments ADD COLUMN IF NOT EXISTS status text DEFAULT 'completed';
ALTER TABLE public.stripe_payments ADD COLUMN IF NOT EXISTS currency text DEFAULT 'usd';

-- RLS for service role (webhook)
ALTER TABLE public.deposits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access deposits" ON public.deposits;
CREATE POLICY "Service role full access deposits" ON public.deposits FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access transactions" ON public.transactions;
CREATE POLICY "Service role full access transactions" ON public.transactions FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');
DROP POLICY IF EXISTS "Users can read own transactions" ON public.transactions;
CREATE POLICY "Users can read own transactions" ON public.transactions FOR SELECT
  USING (auth.uid() = user_id);

ALTER TABLE public.stripe_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access stripe_payments" ON public.stripe_payments;
CREATE POLICY "Service role full access stripe_payments" ON public.stripe_payments FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');
DROP POLICY IF EXISTS "Users can read own stripe_payments" ON public.stripe_payments;
CREATE POLICY "Users can read own stripe_payments" ON public.stripe_payments FOR SELECT
  USING (auth.uid() = user_id);

-- increment_user_balance (cents) for webhook
CREATE OR REPLACE FUNCTION public.increment_user_balance(p_user_id uuid, p_amount_cents bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_user_id IS NULL OR p_amount_cents IS NULL OR p_amount_cents <= 0 THEN RETURN; END IF;
  UPDATE public.users
  SET balance = COALESCE(balance, 0) + p_amount_cents,
      updated_at = now()
  WHERE id = p_user_id;
END;
$$;
