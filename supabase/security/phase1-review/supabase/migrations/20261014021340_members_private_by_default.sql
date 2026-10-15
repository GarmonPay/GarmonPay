-- Only future member defaults; no existing records, policies, grants or balances change.
BEGIN;
ALTER TABLE public.gp_sol_members ALTER COLUMN wallet_public SET DEFAULT false;
COMMIT;
