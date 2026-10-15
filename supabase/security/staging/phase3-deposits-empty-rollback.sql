-- Local-only empty rollback. Never destroy settlement authorization or journal history.
BEGIN;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.gp_sol_settlement_intents) OR EXISTS(SELECT 1 FROM public.gp_sol_settlement_receipts) OR EXISTS(SELECT 1 FROM public.gp_sol_journals WHERE event_type='gp_sol_deposit') THEN RAISE EXCEPTION 'Rollback refused: settlement history exists'; END IF;
END $$;
DROP VIEW public.gp_sol_deposit_reconciliation;
DROP FUNCTION public.gp_sol_post_verified_deposit(uuid,text,text,integer,bigint,timestamptz,text,text,bigint,boolean);
DROP TABLE public.gp_sol_settlement_receipts;
DROP TABLE public.gp_sol_settlement_intents;
DROP FUNCTION public.gp_sol_intent_immutable_binding();
COMMIT;
