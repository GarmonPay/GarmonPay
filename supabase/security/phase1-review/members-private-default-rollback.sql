BEGIN;
ALTER TABLE public.gp_sol_members ALTER COLUMN wallet_public SET DEFAULT true;
COMMIT;
