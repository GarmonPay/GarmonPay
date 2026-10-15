-- Production delta for display names and short invite codes.
-- Does not change existing wallet_public values. New rows default to private.
ALTER TABLE public.gp_sol_members
  ADD COLUMN IF NOT EXISTS display_name text NOT NULL DEFAULT '';
ALTER TABLE public.gp_sol_members
  DROP CONSTRAINT IF EXISTS gp_sol_members_display_name_check;
ALTER TABLE public.gp_sol_members
  ADD CONSTRAINT gp_sol_members_display_name_check
  CHECK (display_name = '' OR (char_length(display_name) BETWEEN 2 AND 32 AND display_name ~ '^[A-Za-z0-9][A-Za-z0-9 .''-]{0,30}[A-Za-z0-9]$'));
ALTER TABLE public.gp_sol_members
  ALTER COLUMN wallet_public SET DEFAULT false;
ALTER TABLE public.gp_sol_members
  ADD COLUMN IF NOT EXISTS referral_slug text;
ALTER TABLE public.gp_sol_members
  DROP CONSTRAINT IF EXISTS gp_sol_members_referral_slug_check;
ALTER TABLE public.gp_sol_members
  ADD CONSTRAINT gp_sol_members_referral_slug_check
  CHECK (referral_slug IS NULL OR referral_slug ~ '^[abcdefghjkmnpqrstuvwxyz23456789]{8}$');

DO $$
DECLARE rec record; slug text; tries int;
BEGIN
  FOR rec IN SELECT id FROM public.gp_sol_members WHERE referral_slug IS NULL ORDER BY created_at LOOP
    tries := 0;
    LOOP
      tries := tries + 1;
      slug := substr(translate(md5(rec.id::text || tries::text || clock_timestamp()::text), '01', '23'), 1, 8);
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.gp_sol_members WHERE referral_slug = slug);
      IF tries > 12 THEN RAISE EXCEPTION 'Referral link unavailable'; END IF;
    END LOOP;
    UPDATE public.gp_sol_members SET referral_slug = slug WHERE id = rec.id AND referral_slug IS NULL;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS gp_sol_members_referral_slug_key ON public.gp_sol_members (referral_slug);

CREATE OR REPLACE FUNCTION public.gp_sol_member_login(p_wallet text, p_token_hash text, p_expires_at timestamptz, p_previous_token_hash text, p_referral text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE member_id uuid; parent_id uuid; new_id uuid := gen_random_uuid(); slug text; tries int := 0;
BEGIN
  PERFORM public.gp_sol_rotate_session(p_wallet, p_token_hash, p_expires_at, p_previous_token_hash);
  SELECT id INTO member_id FROM public.gp_sol_members WHERE wallet_address = p_wallet;
  IF member_id IS NULL THEN
    IF p_referral IS NOT NULL THEN
      SELECT m.id INTO parent_id FROM public.gp_sol_members m JOIN public.gp_sol_identities i USING (wallet_address)
      WHERE (m.referral_code = p_referral OR m.referral_slug = p_referral) AND m.wallet_address <> p_wallet AND NOT i.banned;
    END IF;
    LOOP
      tries := tries + 1;
      slug := substr(translate(md5(new_id::text || tries::text || clock_timestamp()::text), '01', '23'), 1, 8);
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.gp_sol_members WHERE referral_slug = slug);
      IF tries > 12 THEN RAISE EXCEPTION 'Referral link unavailable'; END IF;
    END LOOP;
    INSERT INTO public.gp_sol_members (id, wallet_address, username, referred_by, wallet_public, referral_slug, display_name)
    VALUES (new_id, p_wallet, 'm_' || substr(replace(new_id::text, '-', ''), 1, 20), parent_id, false, slug, '')
    RETURNING id INTO member_id;
  END IF;
  RETURN member_id;
END $$;

DROP FUNCTION IF EXISTS public.gp_sol_member_save(text, text, text, text, boolean);
CREATE FUNCTION public.gp_sol_member_save(p_hash text, p_username text, p_bio text, p_picture text, p_public boolean, p_display text DEFAULT NULL)
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

CREATE OR REPLACE FUNCTION public.gp_sol_member_directory(p_query text, p_username text, p_hash text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(item ORDER BY username), '[]'::jsonb) FROM (
    SELECT m.username, jsonb_build_object(
      'id', m.id,
      'username', m.username,
      'displayName', m.display_name,
      'biography', m.biography,
      'picture', m.picture,
      'wallet', CASE WHEN m.wallet_public THEN m.wallet_address ELSE NULL END,
      'followers', (SELECT count(*) FROM public.gp_sol_member_follows WHERE followed = m.id),
      'following', (SELECT count(*) FROM public.gp_sol_member_follows WHERE follower = m.id),
      'isFollowing', EXISTS(SELECT 1 FROM public.gp_sol_member_follows WHERE follower = public.gp_sol_member_actor(p_hash) AND followed = m.id)
    ) item
    FROM public.gp_sol_members m JOIN public.gp_sol_identities i USING (wallet_address)
    WHERE NOT i.banned
      AND (p_username IS NULL OR m.username = lower(p_username))
      AND (p_query IS NULL OR strpos(m.username, lower(left(p_query, 24))) > 0 OR strpos(lower(m.display_name), lower(left(p_query, 32))) > 0)
    ORDER BY m.username LIMIT 30
  ) results;
$$;

CREATE OR REPLACE FUNCTION public.gp_sol_member_me(p_hash text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', m.id,
    'username', m.username,
    'displayName', m.display_name,
    'biography', m.biography,
    'picture', m.picture,
    'wallet', m.wallet_address,
    'walletPublic', m.wallet_public,
    'referralCode', m.referral_code,
    'referralSlug', m.referral_slug,
    'referrals', (SELECT count(*) FROM public.gp_sol_members WHERE referred_by = m.id)
  )
  FROM public.gp_sol_members m WHERE m.id = public.gp_sol_member_actor(p_hash);
$$;

REVOKE ALL ON FUNCTION public.gp_sol_member_login(text, text, timestamptz, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gp_sol_member_save(text, text, text, text, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gp_sol_member_directory(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gp_sol_member_me(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gp_sol_member_login(text, text, timestamptz, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.gp_sol_member_save(text, text, text, text, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.gp_sol_member_directory(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.gp_sol_member_me(text) TO service_role;
NOTIFY pgrst, 'reload schema';
