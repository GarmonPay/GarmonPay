-- Reviewed rollback for an EMPTY, inactive foundation only. Never execute automatically.
-- Requires an exact catalog/backup and confirmation that wallet authentication is disabled.
BEGIN;
DO $$ DECLARE t text; populated boolean; BEGIN
 FOREACH t IN ARRAY ARRAY['gp_sol_identities','gp_sol_challenges','gp_sol_sessions','gp_sol_launches','gp_sol_campaigns','gp_sol_engagements','gp_sol_accounts','gp_sol_journals','gp_sol_withdrawals','gp_sol_referrals','gp_sol_admin_actions'] LOOP
  EXECUTE format('LOCK TABLE public.%I IN ACCESS EXCLUSIVE MODE',t);
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I LIMIT 1)',t) INTO populated;
  IF populated THEN RAISE EXCEPTION 'Rollback refused: % has history. Preserve records and use a forward repair.',t; END IF;
 END LOOP;
END $$;
DROP FUNCTION public.gp_sol_issue_challenge(text,text,text,text,text,timestamptz),public.gp_sol_consume_challenge(uuid,text),public.gp_sol_create_session(text,text,timestamptz);
DROP TABLE public.gp_sol_admin_actions,public.gp_sol_withdrawals,public.gp_sol_referrals,public.gp_sol_journals,public.gp_sol_accounts,public.gp_sol_engagements,public.gp_sol_campaigns,public.gp_sol_launches,public.gp_sol_sessions,public.gp_sol_challenges,public.gp_sol_identities;
DROP FUNCTION public.gp_sol_immutable();
COMMIT;
