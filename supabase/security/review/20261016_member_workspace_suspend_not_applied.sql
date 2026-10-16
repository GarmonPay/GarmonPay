-- REVIEW ONLY: non-destructive production rollback / suspension.
-- Requires separate database approval. Preserves ALL paper fills, archives,
-- accounts, drafts, audit rows, identities, sessions and referrals.
BEGIN;
SET LOCAL lock_timeout = '5s';
-- Same temporary ownership-transfer membership as the forward migration.
GRANT gp_member_executor TO CURRENT_USER;
REVOKE EXECUTE ON FUNCTION public.gp_member_record_paper_fill(text,text,text,bigint,bigint,uuid,uuid) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.gp_member_save_ad_draft(text,text,text,text,integer) FROM service_role;
REVOKE INSERT ON public.gp_member_price_observations FROM gp_member_price_publisher;
-- Keep the member snapshot compatible without issuing virtual SOL or doing DML.
CREATE OR REPLACE FUNCTION public.gp_member_workspace(p_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF public.gp_member_actor(p_hash) IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
 RETURN jsonb_build_object('ready',false,'maintenance',true,'virtual',true);
END $$;
REVOKE ALL ON FUNCTION public.gp_member_workspace(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gp_member_workspace(text) TO service_role;
REVOKE gp_member_executor FROM CURRENT_USER;
NOTIFY pgrst, 'reload schema';
COMMIT;
