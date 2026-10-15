-- Local additive-function rollback only. Preserves all identity and session history.
BEGIN;
DROP FUNCTION public.gp_sol_rotate_session(text,text,timestamptz,text);
COMMIT;
