-- Patch sync_users_balance_from_wallet() to also keep users.balance_cents in sync.
--
-- Context:
--   wallet_ledger_entry RPC  →  updates wallet_balances.balance (bigint cents)
--   trigger (this file)      →  copies to users.balance  AND  users.balance_cents
--
-- Previously the trigger only set users.balance, leaving users.balance_cents stale.
-- The dashboard reads users.balance; game/API reads wallet_balances via
-- getCanonicalBalanceCents(). Both stay correct, but balance_cents was orphaned.

CREATE OR REPLACE FUNCTION public.sync_users_balance_from_wallet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.users
  SET
    balance       = NEW.balance,
    balance_cents = NEW.balance::integer,
    updated_at    = now()
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;

-- Backfill: bring balance_cents up to date for all existing rows
UPDATE public.users u
SET balance_cents = wb.balance::integer
FROM public.wallet_balances wb
WHERE wb.user_id = u.id
  AND (u.balance_cents IS DISTINCT FROM wb.balance::integer);
