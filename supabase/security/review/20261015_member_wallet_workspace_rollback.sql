-- Rollback for the unapplied review file 20261015_member_wallet_workspace.sql.
-- Drops only the tables and functions that file creates. Does not touch gp_sol_*.

BEGIN;
DROP FUNCTION IF EXISTS public.gp_member_paper_rankings(text);
DROP FUNCTION IF EXISTS public.gp_member_save_ad_draft(text, text, text, text, integer);
DROP FUNCTION IF EXISTS public.gp_member_record_paper_fill(text, text, text, bigint, bigint, bigint, bigint, text);
DROP FUNCTION IF EXISTS public.gp_member_workspace(text);
DROP TRIGGER IF EXISTS gp_member_audit_guard ON public.gp_member_audit;
DROP TRIGGER IF EXISTS gp_member_ad_drafts_guard ON public.gp_member_ad_drafts;
DROP TRIGGER IF EXISTS gp_member_paper_fills_guard ON public.gp_member_paper_fills;
DROP TRIGGER IF EXISTS gp_member_paper_positions_guard ON public.gp_member_paper_positions;
DROP TRIGGER IF EXISTS gp_member_paper_accounts_guard ON public.gp_member_paper_accounts;
DROP FUNCTION IF EXISTS public.gp_member_guard_paper_write();
DROP TABLE IF EXISTS public.gp_member_audit;
DROP TABLE IF EXISTS public.gp_member_ad_drafts;
DROP TABLE IF EXISTS public.gp_member_paper_fills;
DROP TABLE IF EXISTS public.gp_member_paper_positions;
DROP TABLE IF EXISTS public.gp_member_paper_accounts;
COMMIT;
