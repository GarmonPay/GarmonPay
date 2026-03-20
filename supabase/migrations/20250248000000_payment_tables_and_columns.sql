-- Payment flow: ensure ALL tables and columns for Stripe, deposits, admin stats exist.
-- Idempotent; safe to run multiple times. Run in Supabase SQL Editor if not using CLI.

-- =============================================================================
-- 1) USERS (required by deposits, transactions, stripe_payments, etc.)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  role text DEFAULT 'user',
  balance numeric DEFAULT 0,
  total_deposits numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS total_deposits numeric DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS balance numeric DEFAULT 0;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role text DEFAULT 'user';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- Stripe Connect (payouts)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS stripe_account_id text;
CREATE UNIQUE INDEX IF NOT EXISTS users_stripe_account_id ON public.users (stripe_account_id) WHERE stripe_account_id IS NOT NULL;

-- =============================================================================
-- 2) PROFILES (webhook updates profiles.balance)
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS balance numeric DEFAULT 0;
  END IF;
END $$;

-- =============================================================================
-- 3) DEPOSITS (webhook + recovery + admin stats)
-- =============================================================================
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

ALTER TABLE public.deposits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow deposits access" ON public.deposits;
DROP POLICY IF EXISTS "Service role full access deposits" ON public.deposits;
CREATE POLICY "Service role full access deposits" ON public.deposits FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- =============================================================================
-- 4) TRANSACTIONS (webhook + recovery + getPlatformTotals)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  type text,
  amount numeric DEFAULT 0,
  status text DEFAULT 'pending',
  description text,
  reference_id text,
  source text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending';
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS reference_id text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS source text;

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

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow transactions access" ON public.transactions;
DROP POLICY IF EXISTS "Users can read own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Service role full access transactions" ON public.transactions;
CREATE POLICY "Service role full access transactions" ON public.transactions FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Users can read own transactions" ON public.transactions FOR SELECT
  USING (auth.uid() = user_id);

-- =============================================================================
-- 5) STRIPE_PAYMENTS (webhook + recovery duplicate check)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.stripe_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  email text NOT NULL,
  amount_cents bigint NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  transaction_id text NOT NULL UNIQUE,
  stripe_session_id text,
  stripe_payment_intent_id text,
  product_type text NOT NULL DEFAULT 'payment' CHECK (product_type IN ('subscription', 'platform_access', 'upgrade', 'payment', 'wallet_fund')),
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'refunded', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stripe_payments DROP CONSTRAINT IF EXISTS stripe_payments_product_type_check;
ALTER TABLE public.stripe_payments ADD CONSTRAINT stripe_payments_product_type_check
  CHECK (product_type IN ('subscription', 'platform_access', 'upgrade', 'payment', 'wallet_fund'));

CREATE INDEX IF NOT EXISTS stripe_payments_user_id ON public.stripe_payments (user_id);
CREATE INDEX IF NOT EXISTS stripe_payments_stripe_session_id ON public.stripe_payments (stripe_session_id);
CREATE INDEX IF NOT EXISTS stripe_payments_created_at ON public.stripe_payments (created_at DESC);

ALTER TABLE public.stripe_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own stripe_payments" ON public.stripe_payments;
DROP POLICY IF EXISTS "Service role full access stripe_payments" ON public.stripe_payments;
CREATE POLICY "Service role full access stripe_payments" ON public.stripe_payments FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Users can read own stripe_payments" ON public.stripe_payments FOR SELECT
  USING (auth.uid() = user_id);

-- =============================================================================
-- 6) WITHDRAWALS (admin stats)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.withdrawals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  amount numeric DEFAULT 0,
  status text DEFAULT 'pending',
  platform_fee numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS platform_fee numeric DEFAULT 0;

-- =============================================================================
-- 7) PLATFORM_REVENUE (admin stats)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.platform_revenue (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  amount numeric DEFAULT 0,
  source text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.platform_revenue ADD COLUMN IF NOT EXISTS amount numeric DEFAULT 0;
ALTER TABLE public.platform_revenue ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.platform_revenue ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

ALTER TABLE public.platform_revenue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access platform_revenue" ON public.platform_revenue;
CREATE POLICY "Service role full access platform_revenue" ON public.platform_revenue FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- =============================================================================
-- 8) PROFIT (admin stats)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.profit (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  amount numeric DEFAULT 0,
  source text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.profit ADD COLUMN IF NOT EXISTS amount numeric DEFAULT 0;
ALTER TABLE public.profit ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.profit ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

ALTER TABLE public.profit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access profit" ON public.profit;
CREATE POLICY "Service role full access profit" ON public.profit FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- =============================================================================
-- 9) RECOVERED_STRIPE_SESSIONS (recover-payments script)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.recovered_stripe_sessions (
  session_id text PRIMARY KEY,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- =============================================================================
-- 10) STRIPE_SUBSCRIPTIONS (webhook subscription handling)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.stripe_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  stripe_subscription_id text NOT NULL UNIQUE,
  stripe_price_id text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'canceled', 'incomplete', 'trialing')),
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stripe_subscriptions_user_id ON public.stripe_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS stripe_subscriptions_stripe_id ON public.stripe_subscriptions (stripe_subscription_id);

ALTER TABLE public.stripe_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own stripe_subscriptions" ON public.stripe_subscriptions;
DROP POLICY IF EXISTS "Service role full access stripe_subscriptions" ON public.stripe_subscriptions;
CREATE POLICY "Service role full access stripe_subscriptions" ON public.stripe_subscriptions FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Users can read own stripe_subscriptions" ON public.stripe_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- =============================================================================
-- 11) INCREMENT_USER_BALANCE (webhook + recovery)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.increment_user_balance(p_user_id uuid, p_amount_cents bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN RETURN; END IF;
  UPDATE public.users
  SET balance = COALESCE(balance, 0) + p_amount_cents,
      updated_at = now()
  WHERE id = p_user_id;
  IF FOUND AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'withdrawable_balance') THEN
    UPDATE public.users SET withdrawable_balance = COALESCE(withdrawable_balance, 0) + p_amount_cents WHERE id = p_user_id;
  END IF;
END;
$$;
