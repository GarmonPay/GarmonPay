-- Reviewed Phase 1 objects only. Preserve every row; disable application authentication first.
BEGIN;
REVOKE ALL ON public.gp_sol_identities,public.gp_sol_challenges,public.gp_sol_sessions,public.gp_sol_members,public.gp_sol_member_follows FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.gp_sol_issue_challenge(text,text,text,text,text,timestamptz),public.gp_sol_consume_challenge(uuid,text),public.gp_sol_create_session(text,text,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.gp_sol_rotate_session(text,text,timestamptz,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.gp_sol_member_actor(text),public.gp_sol_member_login(text,text,timestamptz,text,text),public.gp_sol_member_save(text,text,text,text,boolean),public.gp_sol_member_follow(text,uuid,boolean),public.gp_sol_member_directory(text,text,text),public.gp_sol_member_me(text) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
