-- Username change audit, old-handle cooldown reservations, and RPCs.

CREATE TABLE IF NOT EXISTS public.username_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  old_username text NOT NULL,
  new_username text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  reason text
);

CREATE INDEX IF NOT EXISTS username_history_user_changed_at_idx
  ON public.username_history (user_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS username_history_old_lower_idx
  ON public.username_history (lower(old_username));

CREATE TABLE IF NOT EXISTS public.username_reservations (
  username_lower text PRIMARY KEY,
  reserved_until timestamptz NOT NULL,
  released_from_user_id uuid REFERENCES public.users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS username_reservations_reserved_until_idx
  ON public.username_reservations (reserved_until);

ALTER TABLE public.username_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.username_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS username_history_select_own ON public.username_history;
CREATE POLICY username_history_select_own
  ON public.username_history FOR SELECT TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT ON public.username_history TO authenticated;

-- No direct access to reservations for clients (RPCs use SECURITY DEFINER).

CREATE OR REPLACE FUNCTION public.cleanup_expired_username_reservations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.username_reservations WHERE reserved_until < now();
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_username_reservations() FROM PUBLIC;

-- Replace single-argument version from username_constraints migration with two-arg + default.
DROP FUNCTION IF EXISTS public.check_username_available(text);

CREATE OR REPLACE FUNCTION public.check_username_available(
  candidate text,
  p_exclude_user_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_candidate text := lower(trim(COALESCE(candidate, '')));
  v_reserved text[] := ARRAY[
    'admin', 'garmonpay', 'support', 'mod', 'moderator', 'system',
    'official', 'bishop', 'anthropic', 'claude', 'root', 'null'
  ];
BEGIN
  PERFORM public.cleanup_expired_username_reservations();

  IF v_candidate = '' THEN
    RETURN false;
  END IF;
  IF length(v_candidate) < 3 OR length(v_candidate) > 20 THEN
    RETURN false;
  END IF;
  IF v_candidate !~ '^[a-zA-Z0-9_]+$' THEN
    RETURN false;
  END IF;
  IF v_candidate = ANY(v_reserved) THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.username_reservations r
    WHERE r.username_lower = v_candidate
      AND r.reserved_until > now()
  ) THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.users u
    WHERE lower(u.username) = v_candidate
      AND (p_exclude_user_id IS NULL OR u.id <> p_exclude_user_id)
  ) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.check_username_available(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_username_available(text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.check_username_available(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_username_available(text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.change_username(p_new_username text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_new text := trim(COALESCE(p_new_username, ''));
  v_old text;
  v_last timestamptz;
  v_row public.users%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  IF v_new = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Username required');
  END IF;

  IF NOT public.check_username_available(v_new, v_uid) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Username is not available');
  END IF;

  SELECT max(h.changed_at) INTO v_last
  FROM public.username_history h
  WHERE h.user_id = v_uid
    AND h.reason = 'self_change';

  IF v_last IS NOT NULL AND v_last > now() - interval '30 days' THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'You can change your username once every 30 days.',
      'next_change_available_at', to_jsonb(v_last + interval '30 days')
    );
  END IF;

  SELECT * INTO v_row
  FROM public.users
  WHERE id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'User not found');
  END IF;

  v_old := v_row.username;
  IF lower(v_old) = lower(v_new) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Choose a different username');
  END IF;

  INSERT INTO public.username_reservations (username_lower, reserved_until, released_from_user_id)
  VALUES (lower(v_old), now() + interval '30 days', v_uid)
  ON CONFLICT (username_lower) DO UPDATE
  SET
    reserved_until = GREATEST(public.username_reservations.reserved_until, excluded.reserved_until),
    released_from_user_id = excluded.released_from_user_id;

  UPDATE public.users
  SET username = v_new
  WHERE id = v_uid;

  INSERT INTO public.username_history (
    user_id, old_username, new_username, changed_by, reason
  ) VALUES (
    v_uid, v_old, v_new, v_uid, 'self_change'
  );

  RETURN jsonb_build_object(
    'success', true,
    'new_username', v_new,
    'next_change_available_at', to_jsonb(now() + interval '30 days')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.change_username(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_username(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_username(text) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_change_username(
  p_target_user_id uuid,
  p_new_username text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_new text := trim(COALESCE(p_new_username, ''));
  v_reason text := trim(COALESCE(p_reason, ''));
  v_old text;
  v_row public.users%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = v_actor
      AND (
        COALESCE(u.is_super_admin, false) = true
        OR lower(COALESCE(u.role, '')) IN ('admin', 'game_admin', 'super_admin')
      )
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Forbidden');
  END IF;

  IF p_target_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'target user required');
  END IF;

  IF v_reason = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Reason is required');
  END IF;

  IF v_new = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Username required');
  END IF;

  IF NOT public.check_username_available(v_new, p_target_user_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Username is not available');
  END IF;

  SELECT * INTO v_row
  FROM public.users
  WHERE id = p_target_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'User not found');
  END IF;

  v_old := v_row.username;
  IF lower(v_old) = lower(v_new) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Choose a different username');
  END IF;

  UPDATE public.users
  SET username = v_new
  WHERE id = p_target_user_id;

  INSERT INTO public.username_history (
    user_id, old_username, new_username, changed_by, reason
  ) VALUES (
    p_target_user_id, v_old, v_new, v_actor, v_reason
  );

  RETURN jsonb_build_object('success', true, 'new_username', v_new);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_change_username(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_change_username(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_change_username(uuid, text, text) TO service_role;
