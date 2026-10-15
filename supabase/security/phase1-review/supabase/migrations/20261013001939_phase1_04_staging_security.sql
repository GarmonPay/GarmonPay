-- Reviewed isolated staging advisor fixes. Not applied to production.
BEGIN;
CREATE INDEX IF NOT EXISTS gp_sol_sessions_wallet ON public.gp_sol_sessions(wallet_address);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.rls_auto_enable()') AND prorettype='event_trigger'::regtype) THEN
  REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC,anon,authenticated,service_role;
 END IF;
END $$;
COMMIT;
