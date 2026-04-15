-- Gold Coins (GC) + Sweeps Coins (SC) — user balances and ledger

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS gold_coins integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sweeps_coins integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lifetime_sc_earned integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lifetime_gc_purchased integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.coin_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  type text NOT NULL,
  gold_coins integer NOT NULL DEFAULT 0,
  sweeps_coins integer NOT NULL DEFAULT 0,
  description text,
  reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coin_transactions_reference_unique UNIQUE (reference)
);

CREATE INDEX IF NOT EXISTS coin_transactions_user_created ON public.coin_transactions (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.gc_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price_cents integer NOT NULL,
  gold_coins integer NOT NULL,
  bonus_sweeps_coins integer NOT NULL,
  bonus_label text,
  is_featured boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS gc_packages_name_key ON public.gc_packages (name);

-- Seed GC packages (idempotent)
INSERT INTO public.gc_packages (name, price_cents, gold_coins, bonus_sweeps_coins, bonus_label, is_featured)
SELECT 'Starter Pack', 999, 1000, 1000, '1,000 SC FREE', false
WHERE NOT EXISTS (SELECT 1 FROM public.gc_packages WHERE name = 'Starter Pack');
INSERT INTO public.gc_packages (name, price_cents, gold_coins, bonus_sweeps_coins, bonus_label, is_featured)
SELECT 'Popular Pack', 2499, 2500, 3000, '3,000 SC FREE', true
WHERE NOT EXISTS (SELECT 1 FROM public.gc_packages WHERE name = 'Popular Pack');
INSERT INTO public.gc_packages (name, price_cents, gold_coins, bonus_sweeps_coins, bonus_label, is_featured)
SELECT 'Pro Pack', 4999, 5000, 7500, '7,500 SC FREE', false
WHERE NOT EXISTS (SELECT 1 FROM public.gc_packages WHERE name = 'Pro Pack');
INSERT INTO public.gc_packages (name, price_cents, gold_coins, bonus_sweeps_coins, bonus_label, is_featured)
SELECT 'Elite Pack', 9999, 10000, 17500, '17,500 SC FREE', false
WHERE NOT EXISTS (SELECT 1 FROM public.gc_packages WHERE name = 'Elite Pack');
INSERT INTO public.gc_packages (name, price_cents, gold_coins, bonus_sweeps_coins, bonus_label, is_featured)
SELECT 'VIP Pack', 24999, 25000, 50000, '50,000 SC FREE', false
WHERE NOT EXISTS (SELECT 1 FROM public.gc_packages WHERE name = 'VIP Pack');

ALTER TABLE public.coin_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own coin transactions" ON public.coin_transactions;
CREATE POLICY "Users read own coin transactions"
ON public.coin_transactions FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- RPCs (service role / server)
CREATE OR REPLACE FUNCTION public.credit_coins(
  p_user_id uuid,
  p_gold_coins integer,
  p_sweeps_coins integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.users SET
    gold_coins = COALESCE(gold_coins, 0) + COALESCE(p_gold_coins, 0),
    sweeps_coins = COALESCE(sweeps_coins, 0) + COALESCE(p_sweeps_coins, 0),
    lifetime_gc_purchased = COALESCE(lifetime_gc_purchased, 0) + GREATEST(0, COALESCE(p_gold_coins, 0)),
    lifetime_sc_earned = COALESCE(lifetime_sc_earned, 0) + GREATEST(0, COALESCE(p_sweeps_coins, 0))
  WHERE id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.debit_sweeps_coins(
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
  SELECT sweeps_coins INTO v_bal FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF v_bal IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  IF v_bal < p_amount THEN
    RAISE EXCEPTION 'Insufficient sweeps coins';
  END IF;
  UPDATE public.users SET
    sweeps_coins = sweeps_coins - p_amount
  WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.credit_coins(uuid, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.debit_sweeps_coins(uuid, integer) TO service_role;

COMMENT ON TABLE public.coin_transactions IS 'GC/SC ledger; inserts from server (service role).';
COMMENT ON TABLE public.gc_packages IS 'Gold coin purchase SKUs for Stripe checkout.';
