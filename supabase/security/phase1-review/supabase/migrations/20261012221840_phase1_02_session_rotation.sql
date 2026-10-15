-- Local-only additive auth staging; not a production activation or migration.
BEGIN;
CREATE FUNCTION public.gp_sol_rotate_session(p_wallet text,p_token_hash text,p_expires_at timestamptz,p_previous_token_hash text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF p_previous_token_hash IS NOT NULL AND p_previous_token_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid previous session reference'; END IF;
 PERFORM public.gp_sol_create_session(p_wallet,p_token_hash,p_expires_at);
 -- The old cookie proves bearer possession at the trusted route; unrelated device
 -- sessions are left intact. New session creation and revocation commit together.
 UPDATE public.gp_sol_sessions SET revoked_at=now() WHERE token_hash=p_previous_token_hash AND token_hash<>p_token_hash AND revoked_at IS NULL;
END $$;
REVOKE ALL ON FUNCTION public.gp_sol_rotate_session(text,text,timestamptz,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gp_sol_rotate_session(text,text,timestamptz,text) TO service_role;
COMMIT;
