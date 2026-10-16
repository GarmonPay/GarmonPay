-- Reviewed only. Do not apply this file to production without separate authorization.
-- Do not move it into supabase/migrations.
-- Adds a 7-day public username cooldown inside gp_sol_member_save.
-- The function never writes wallet_address.

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.gp_sol_members
  ADD COLUMN IF NOT EXISTS username_changed_at timestamptz;


-- Trigger enforcement also covers direct privileged UPDATEs. No backfill changes
-- existing usernames, wallets, attribution, or records of earlier changes.
CREATE OR REPLACE FUNCTION public.gp_sol_guard_username_change()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.username IS DISTINCT FROM OLD.username THEN
    IF OLD.username_changed_at IS NOT NULL
       AND OLD.username_changed_at > clock_timestamp() - interval '7 days' THEN
      RAISE EXCEPTION 'Username changes are limited to once every seven days';
    END IF;
    NEW.username_changed_at := clock_timestamp();
  ELSIF NEW.username_changed_at IS DISTINCT FROM OLD.username_changed_at THEN
    RAISE EXCEPTION 'Username history cannot be rewritten';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.gp_sol_guard_username_change() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS gp_sol_username_cooldown ON public.gp_sol_members;
CREATE TRIGGER gp_sol_username_cooldown BEFORE UPDATE OF username, username_changed_at
ON public.gp_sol_members FOR EACH ROW EXECUTE FUNCTION public.gp_sol_guard_username_change();

-- Application capability check: absent on databases that have only the column.
CREATE OR REPLACE FUNCTION public.gp_sol_username_policy()
RETURNS text LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT 'seven-day-atomic-v1'::text;
$$;
REVOKE ALL ON FUNCTION public.gp_sol_username_policy() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gp_sol_username_policy() TO service_role;

CREATE OR REPLACE FUNCTION public.gp_sol_member_save(p_hash text, p_username text, p_bio text, p_picture text, p_public boolean, p_display text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  actor uuid := public.gp_sol_member_actor(p_hash);
  current_handle text;
  current_wallet text;
  changed_at timestamptz;
  next_handle text;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_public IS NULL OR p_bio IS NULL THEN RAISE EXCEPTION 'Invalid profile'; END IF;
  IF p_username IS NOT NULL AND (p_username !~ '^[a-z][a-z0-9_]{2,23}$' OR p_username IN ('admin', 'administrator', 'support', 'garmonpay', 'moderator')) THEN RAISE EXCEPTION 'Invalid handle'; END IF;
  IF p_display IS NOT NULL AND p_display <> '' AND (char_length(p_display) < 2 OR char_length(p_display) > 32 OR p_display !~ '^[A-Za-z0-9][A-Za-z0-9 .''-]{0,30}[A-Za-z0-9]$') THEN RAISE EXCEPTION 'Invalid display name'; END IF;
  SELECT username, wallet_address, username_changed_at INTO current_handle, current_wallet, changed_at
  FROM public.gp_sol_members WHERE id = actor FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.gp_sol_sessions s JOIN public.gp_sol_identities i USING (wallet_address)
    WHERE s.token_hash = p_hash AND s.wallet_address = current_wallet
      AND s.revoked_at IS NULL AND s.expires_at > clock_timestamp() AND NOT i.banned
  ) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  next_handle := COALESCE(lower(p_username), current_handle);
  IF next_handle IS DISTINCT FROM current_handle THEN
    IF changed_at IS NOT NULL AND changed_at > clock_timestamp() - interval '7 days' THEN
      RAISE EXCEPTION 'This public username can change again after %', to_char(changed_at + interval '7 days', 'YYYY-MM-DD');
    END IF;
  END IF;
  UPDATE public.gp_sol_members
  SET username = next_handle,
      display_name = COALESCE(p_display, display_name),
      biography = p_bio,
      picture = p_picture,
      wallet_public = p_public,
      username_changed_at = CASE WHEN next_handle IS DISTINCT FROM current_handle THEN clock_timestamp() ELSE username_changed_at END
  WHERE id = actor AND wallet_address = current_wallet;
END $$;

REVOKE ALL ON FUNCTION public.gp_sol_member_save(text, text, text, text, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gp_sol_member_save(text, text, text, text, boolean, text) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
