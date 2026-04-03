-- Root cause: AFTER UPDATE trigger on wallet_balances runs UPDATE public.users on every ledger movement.
-- If public.users does not exist (or was never migrated), wallet_ledger_entry fails and rolls back —
-- e.g. C-Lo "Create Room" shows: relation "users" does not exist.
--
-- Keep syncing when public.users exists; otherwise no-op (ledger + wallet_balances remain authoritative).

CREATE OR REPLACE FUNCTION public.sync_users_balance_from_wallet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    UPDATE public.users
    SET
      balance       = NEW.balance,
      balance_cents = NEW.balance::integer,
      updated_at    = now()
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;
