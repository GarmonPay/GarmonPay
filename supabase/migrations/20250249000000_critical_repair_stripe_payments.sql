-- =============================================================================
-- CRITICAL DATABASE REPAIR — Stripe payment system
-- Run this in Supabase SQL Editor. Idempotent; safe to run multiple times.
-- =============================================================================

-- 1) Ensure public.users exists and has balance column
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  role text DEFAULT 'user',
  balance numeric DEFAULT 0,
  total_deposits numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS balance numeric DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS total_deposits numeric DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role text DEFAULT 'user';

-- 2) stripe_payments — EXACT structure when table does not exist
CREATE TABLE IF NOT EXISTS public.stripe_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  email text,
  amount numeric,
  currency text,
  product_type text,
  stripe_session_id text UNIQUE,
  stripe_payment_intent text,
  status text,
  created_at timestamp with time zone DEFAULT now()
);

-- Add any columns that might be missing if table was created by an older migration
ALTER TABLE public.stripe_payments ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.stripe_payments ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.stripe_payments ADD COLUMN IF NOT EXISTS amount numeric;
ALTER TABLE public.stripe_payments ADD COLUMN IF NOT EXISTS currency text;
ALTER TABLE public.stripe_payments ADD COLUMN IF NOT EXISTS product_type text;
ALTER TABLE public.stripe_payments ADD COLUMN IF NOT EXISTS stripe_session_id text;
ALTER TABLE public.stripe_payments ADD COLUMN IF NOT EXISTS stripe_payment_intent text;
ALTER TABLE public.stripe_payments ADD COLUMN IF NOT EXISTS status text;

-- RLS so service role (webhook) can insert/select
ALTER TABLE public.stripe_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access stripe_payments" ON public.stripe_payments;
CREATE POLICY "Service role full access stripe_payments" ON public.stripe_payments FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- 3) transactions — ensure table and columns exist for webhook
CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  type text,
  amount numeric DEFAULT 0,
  status text DEFAULT 'pending',
  description text,
  reference_id text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending';
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS reference_id text;

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_type_check
  CHECK (type IN (
    'deposit',
    'withdrawal',
    'referral',
    'referral_commission',
    'earning',
    'ad_credit',
    'spin_wheel',
    'scratch_card',
    'mystery_box',
    'streak',
    'mission',
    'tournament_entry',
    'tournament_prize',
    'team_prize',
    'fight_entry',
    'fight_prize',
    'boxing_entry',
    'boxing_prize',
    'boxing_bet',
    'boxing_bet_payout',
    'game_win',
    'game_loss',
    'admin_adjustment'
  ));

-- 4) deposits — for webhook and dashboard
CREATE TABLE IF NOT EXISTS public.deposits (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  amount numeric DEFAULT 0,
  status text DEFAULT 'completed',
  stripe_session text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.deposits ADD COLUMN IF NOT EXISTS stripe_session text;

ALTER TABLE public.deposits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access deposits" ON public.deposits;
CREATE POLICY "Service role full access deposits" ON public.deposits FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- 5) increment_user_balance — webhook updates users.balance via this or direct update
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
