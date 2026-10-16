-- DESTRUCTIVE CLEANUP: disposable environments or an explicitly approved empty release only.
-- For production after activity, use 20261016_member_workspace_suspend_not_applied.sql
-- to preserve immutable fills, ranking archives and all audit evidence.
-- Rollback for the unapplied review file 20261015_member_wallet_workspace.sql.
-- Removes only phase-2 objects, roles, and additive read policies/grants.
-- Does not change gp_sol_* rows, original policies, functions, or grants.

BEGIN;
-- The migration owner retains role administration, but no runtime membership.
GRANT gp_member_executor TO CURRENT_USER;
DROP FUNCTION IF EXISTS public.gp_member_paper_rankings(text);
DROP FUNCTION IF EXISTS public.gp_member_rank_archive(text,timestamptz);
DROP FUNCTION IF EXISTS public.gp_member_freeze_rankings(text,timestamptz);
DROP FUNCTION IF EXISTS public.gp_member_rankings_at(timestamptz,timestamptz);
DROP TABLE IF EXISTS public.gp_member_paper_rank_archives;
DROP FUNCTION IF EXISTS public.gp_member_save_ad_draft(text, text, text, text, integer);
DROP FUNCTION IF EXISTS public.gp_member_paper_history(text,timestamptz,uuid);
DROP FUNCTION IF EXISTS public.gp_member_paper_request(text,uuid,text,text,bigint,bigint);
DROP FUNCTION IF EXISTS public.gp_member_record_paper_fill(text, text, text, bigint, bigint, uuid, uuid);
DROP FUNCTION IF EXISTS public.gp_member_workspace(text);
DROP FUNCTION IF EXISTS public.gp_member_paper_value(uuid,timestamptz);
DROP FUNCTION IF EXISTS public.gp_member_actor(text);
DROP TRIGGER IF EXISTS gp_member_audit_guard ON public.gp_member_audit;
DROP TRIGGER IF EXISTS gp_member_ad_drafts_guard ON public.gp_member_ad_drafts;
DROP TRIGGER IF EXISTS gp_member_paper_fills_guard ON public.gp_member_paper_fills;
DROP TRIGGER IF EXISTS gp_member_paper_positions_guard ON public.gp_member_paper_positions;
DROP TRIGGER IF EXISTS gp_member_paper_accounts_guard ON public.gp_member_paper_accounts;
DROP FUNCTION IF EXISTS public.gp_member_guard_paper_write();
DROP TABLE IF EXISTS public.gp_member_audit;
DROP TABLE IF EXISTS public.gp_member_ad_drafts;
DROP TABLE IF EXISTS public.gp_member_paper_fills;
DROP TABLE IF EXISTS public.gp_member_price_observations;
DROP TABLE IF EXISTS public.gp_member_ranking_decisions;
DROP FUNCTION IF EXISTS public.gp_member_stamp_record();
DROP TABLE IF EXISTS public.gp_member_paper_positions;
DROP TABLE IF EXISTS public.gp_member_paper_accounts;
DROP FUNCTION IF EXISTS public.gp_member_immutable();
DROP POLICY gp_member_executor_read ON public.gp_sol_members;
DROP POLICY gp_member_executor_read ON public.gp_sol_sessions;
DROP POLICY gp_member_executor_read ON public.gp_sol_identities;
REVOKE SELECT (id, wallet_address, username, display_name) ON public.gp_sol_members FROM gp_member_executor;
REVOKE SELECT (token_hash, wallet_address, revoked_at, expires_at) ON public.gp_sol_sessions FROM gp_member_executor;
REVOKE SELECT (wallet_address, banned) ON public.gp_sol_identities FROM gp_member_executor;
REVOKE USAGE ON SCHEMA public FROM gp_member_executor;
REVOKE USAGE ON SCHEMA public FROM gp_member_price_publisher;
DROP ROLE gp_member_executor;
DROP ROLE gp_member_price_publisher;
COMMIT;
