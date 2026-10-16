-- REVIEW ONLY. Requires separate production authorization.
-- Compatible rollback restores the pre-cooldown RPC while retaining all username
-- values and history. Keep renames locked in application code after rollback.
-- Retains username_changed_at to avoid deleting audit evidence.
BEGIN;
SET LOCAL lock_timeout = '5s';
DROP TRIGGER IF EXISTS gp_sol_username_cooldown ON public.gp_sol_members;
DROP FUNCTION IF EXISTS public.gp_sol_guard_username_change();
DROP FUNCTION IF EXISTS public.gp_sol_username_policy();
CREATE OR REPLACE FUNCTION public.gp_sol_member_save(p_hash text, p_username text, p_bio text, p_picture text, p_public boolean, p_display text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE actor uuid := public.gp_sol_member_actor(p_hash);
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_public IS NULL OR p_bio IS NULL THEN RAISE EXCEPTION 'Invalid profile'; END IF;
  IF p_username IS NOT NULL AND (p_username !~ '^[a-z][a-z0-9_]{2,23}$' OR p_username IN ('admin', 'administrator', 'support', 'garmonpay', 'moderator')) THEN RAISE EXCEPTION 'Invalid handle'; END IF;
  IF p_display IS NOT NULL AND p_display <> '' AND (char_length(p_display) < 2 OR char_length(p_display) > 32 OR p_display !~ '^[A-Za-z0-9][A-Za-z0-9 .''-]{0,30}[A-Za-z0-9]$') THEN RAISE EXCEPTION 'Invalid display name'; END IF;
  UPDATE public.gp_sol_members
  SET username = COALESCE(lower(p_username), username),
      display_name = COALESCE(p_display, display_name),
      biography = p_bio,
      picture = p_picture,
      wallet_public = p_public
  WHERE id = actor;
END $$;


REVOKE ALL ON FUNCTION public.gp_sol_member_save(text,text,text,text,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gp_sol_member_save(text,text,text,text,boolean,text) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
