-- Reconcile stored USD balances from wallet_ledger (append-only truth).
-- Fixes drift from legacy seeds (e.g. profiles.balance / users.balance) vs completed ledger entries.

-- 1) wallet_balances: set each row to latest ledger balance_after (0 if no ledger rows)
UPDATE public.wallet_balances wb
SET
  balance = COALESCE(
    (
      SELECT wl.balance_after
      FROM public.wallet_ledger wl
      WHERE wl.user_id = wb.user_id
      ORDER BY wl.created_at DESC
      LIMIT 1
    ),
    0
  ),
  updated_at = now();

-- 2) Insert wallet_balances for users with ledger history but no row yet
INSERT INTO public.wallet_balances (user_id, balance, updated_at)
SELECT s.user_id, s.balance_after, now()
FROM (
  SELECT DISTINCT ON (wl.user_id) wl.user_id, wl.balance_after
  FROM public.wallet_ledger wl
  ORDER BY wl.user_id, wl.created_at DESC
) s
WHERE NOT EXISTS (SELECT 1 FROM public.wallet_balances wb WHERE wb.user_id = s.user_id)
ON CONFLICT (user_id) DO NOTHING;

-- 3) Mirror profiles.balance from wallet_balances (cents); balance_cents when column exists
UPDATE public.profiles p
SET balance = wb.balance::numeric
FROM public.wallet_balances wb
WHERE p.id = wb.user_id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'balance_cents'
  ) THEN
    UPDATE public.profiles p
    SET balance_cents = wb.balance
    FROM public.wallet_balances wb
    WHERE p.id = wb.user_id;
  END IF;
END $$;
