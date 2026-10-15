-- Synthetic staging only. Requires SOL foundation and session rotation. No production application authorized.
BEGIN;
CREATE TABLE public.gp_sol_members (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 wallet_address text NOT NULL UNIQUE REFERENCES public.gp_sol_identities(wallet_address),
 username text NOT NULL UNIQUE CHECK(username ~ '^[a-z][a-z0-9_]{2,23}$' AND username NOT IN ('admin','administrator','support','garmonpay','moderator')),
 biography text NOT NULL DEFAULT '' CHECK(length(biography)<=280),
 picture text CHECK(length(picture)<=6000 AND picture ~ '^data:image/(png|jpeg);base64,[A-Za-z0-9+/]+=*$'),
 wallet_public boolean NOT NULL DEFAULT true,
 referral_code text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text,'-',''),
 referred_by uuid REFERENCES public.gp_sol_members(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(referred_by IS NULL OR referred_by<>id)
);
CREATE TABLE public.gp_sol_member_follows (
 follower uuid NOT NULL REFERENCES public.gp_sol_members(id),
 followed uuid NOT NULL REFERENCES public.gp_sol_members(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(follower,followed), CHECK(follower<>followed)
);
CREATE INDEX ON public.gp_sol_member_follows(followed);
CREATE INDEX ON public.gp_sol_members(referred_by);
ALTER TABLE public.gp_sol_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gp_sol_member_follows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gp_sol_members,public.gp_sol_member_follows FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.gp_sol_members TO service_role;
GRANT SELECT,INSERT,DELETE ON public.gp_sol_member_follows TO service_role;
CREATE FUNCTION public.gp_sol_member_actor(p_hash text) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT m.id FROM public.gp_sol_sessions s JOIN public.gp_sol_identities i USING(wallet_address) JOIN public.gp_sol_members m USING(wallet_address)
 WHERE s.token_hash=p_hash AND s.revoked_at IS NULL AND s.expires_at>now() AND NOT i.banned;
$$;
CREATE FUNCTION public.gp_sol_member_login(p_wallet text,p_token_hash text,p_expires_at timestamptz,p_previous_token_hash text,p_referral text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE member_id uuid; parent_id uuid; new_id uuid:=gen_random_uuid();
BEGIN
 PERFORM public.gp_sol_rotate_session(p_wallet,p_token_hash,p_expires_at,p_previous_token_hash);
 -- create_session takes a wallet advisory lock: first verified signup wins attribution permanently.
 SELECT id INTO member_id FROM public.gp_sol_members WHERE wallet_address=p_wallet;
 IF member_id IS NULL THEN
  SELECT m.id INTO parent_id FROM public.gp_sol_members m JOIN public.gp_sol_identities i USING(wallet_address) WHERE m.referral_code=p_referral AND m.wallet_address<>p_wallet AND NOT i.banned;
  INSERT INTO public.gp_sol_members(id,wallet_address,username,referred_by)
   VALUES(new_id,p_wallet,'m_'||substr(replace(new_id::text,'-',''),1,20),parent_id) RETURNING id INTO member_id;
 END IF;
 RETURN member_id;
END $$;
CREATE FUNCTION public.gp_sol_member_save(p_hash text,p_username text,p_bio text,p_picture text,p_public boolean)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE actor uuid:=public.gp_sol_member_actor(p_hash);
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
 IF p_public IS NULL OR p_username IS NULL OR p_bio IS NULL THEN RAISE EXCEPTION 'Invalid profile'; END IF;
 UPDATE public.gp_sol_members SET username=lower(p_username),biography=p_bio,picture=p_picture,wallet_public=p_public WHERE id=actor;
END $$;
CREATE FUNCTION public.gp_sol_member_follow(p_hash text,p_target uuid,p_follow boolean)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE actor uuid:=public.gp_sol_member_actor(p_hash);
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
 IF p_target=actor OR p_follow IS NULL OR NOT EXISTS(SELECT 1 FROM public.gp_sol_members m JOIN public.gp_sol_identities i USING(wallet_address) WHERE m.id=p_target AND NOT i.banned) THEN RAISE EXCEPTION 'Invalid member'; END IF;
 IF p_follow THEN INSERT INTO public.gp_sol_member_follows(follower,followed) VALUES(actor,p_target) ON CONFLICT DO NOTHING;
 ELSE DELETE FROM public.gp_sol_member_follows WHERE follower=actor AND followed=p_target; END IF;
END $$;
CREATE FUNCTION public.gp_sol_member_directory(p_query text,p_username text,p_hash text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(item ORDER BY username),'[]'::jsonb) FROM (
 SELECT m.username,jsonb_build_object('id',m.id,'username',m.username,'biography',m.biography,'picture',m.picture,
 'wallet',CASE WHEN m.wallet_public THEN m.wallet_address ELSE NULL END,
 'followers',(SELECT count(*) FROM public.gp_sol_member_follows WHERE followed=m.id),
 'following',(SELECT count(*) FROM public.gp_sol_member_follows WHERE follower=m.id),
 'isFollowing',EXISTS(SELECT 1 FROM public.gp_sol_member_follows WHERE follower=public.gp_sol_member_actor(p_hash) AND followed=m.id)) item
 FROM public.gp_sol_members m JOIN public.gp_sol_identities i USING(wallet_address)
 WHERE NOT i.banned AND (p_username IS NULL OR m.username=lower(p_username)) AND (p_query IS NULL OR strpos(m.username,lower(left(p_query,24)))>0)
 ORDER BY m.username LIMIT 30) results;
$$;
CREATE FUNCTION public.gp_sol_member_me(p_hash text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('id',m.id,'username',m.username,'biography',m.biography,'picture',m.picture,'wallet',m.wallet_address,'walletPublic',m.wallet_public,'referralCode',m.referral_code,'referrals',(SELECT count(*) FROM public.gp_sol_members WHERE referred_by=m.id))
 FROM public.gp_sol_members m WHERE m.id=public.gp_sol_member_actor(p_hash);
$$;
REVOKE ALL ON FUNCTION public.gp_sol_member_actor(text),public.gp_sol_member_login(text,text,timestamptz,text,text),public.gp_sol_member_save(text,text,text,text,boolean),public.gp_sol_member_follow(text,uuid,boolean),public.gp_sol_member_directory(text,text,text),public.gp_sol_member_me(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gp_sol_member_actor(text),public.gp_sol_member_login(text,text,timestamptz,text,text),public.gp_sol_member_save(text,text,text,text,boolean),public.gp_sol_member_follow(text,uuid,boolean),public.gp_sol_member_directory(text,text,text),public.gp_sol_member_me(text) TO service_role;
COMMIT;
