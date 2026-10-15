-- Restore reviewed grants only; this does not enable application authentication.
BEGIN;
REVOKE ALL ON public.gp_sol_identities,public.gp_sol_challenges,public.gp_sol_sessions,public.gp_sol_members,public.gp_sol_member_follows FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.gp_sol_issue_challenge(text,text,text,text,text,timestamptz),public.gp_sol_consume_challenge(uuid,text),public.gp_sol_create_session(text,text,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.gp_sol_rotate_session(text,text,timestamptz,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.gp_sol_member_actor(text),public.gp_sol_member_login(text,text,timestamptz,text,text),public.gp_sol_member_save(text,text,text,text,boolean),public.gp_sol_member_follow(text,uuid,boolean),public.gp_sol_member_directory(text,text,text),public.gp_sol_member_me(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.gp_sol_identities,public.gp_sol_challenges,public.gp_sol_sessions TO service_role;
GRANT SELECT,INSERT,UPDATE ON public.gp_sol_members TO service_role;
GRANT SELECT,INSERT,DELETE ON public.gp_sol_member_follows TO service_role;
GRANT EXECUTE ON FUNCTION public.gp_sol_issue_challenge(text,text,text,text,text,timestamptz),public.gp_sol_consume_challenge(uuid,text),public.gp_sol_create_session(text,text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.gp_sol_rotate_session(text,text,timestamptz,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.gp_sol_member_actor(text),public.gp_sol_member_login(text,text,timestamptz,text,text),public.gp_sol_member_save(text,text,text,text,boolean),public.gp_sol_member_follow(text,uuid,boolean),public.gp_sol_member_directory(text,text,text),public.gp_sol_member_me(text) TO service_role;
COMMIT;
