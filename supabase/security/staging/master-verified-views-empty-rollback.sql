-- Empty staging only. Never discard accrued obligation/audit history.
BEGIN;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.gp_sol_view_awards) OR EXISTS(SELECT 1 FROM public.gp_sol_view_proofs) OR EXISTS(SELECT 1 FROM public.gp_sol_view_budgets) THEN
 RAISE EXCEPTION 'Rollback refused: preserve view and funding history';
 END IF;
END $$;
DROP FUNCTION public.gp_sol_claim_verified_view(uuid,text);
DROP TABLE public.gp_sol_view_awards,public.gp_sol_view_proofs,public.gp_sol_view_budgets;
COMMIT;
