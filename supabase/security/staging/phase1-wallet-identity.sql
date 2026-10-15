-- Phase 1 identity only. LOCAL STAGING; production approval required. No financial tables or legacy edits.
BEGIN;
CREATE TABLE public.gp_sol_identities (
  wallet_address text PRIMARY KEY CHECK (wallet_address ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
  display_name text CHECK (length(display_name) <= 60), banned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.gp_sol_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), wallet_address text NOT NULL,
  nonce text UNIQUE NOT NULL, rate_key text NOT NULL, binding_hash text NOT NULL, message text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, consumed_at timestamptz,
  CHECK (expires_at > issued_at AND expires_at <= issued_at + interval '5 minutes 5 seconds')
);
CREATE INDEX gp_sol_challenges_wallet_time ON public.gp_sol_challenges(wallet_address, issued_at);
CREATE INDEX gp_sol_challenges_rate_time ON public.gp_sol_challenges(rate_key,issued_at);
CREATE TABLE public.gp_sol_sessions (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  wallet_address text NOT NULL REFERENCES public.gp_sol_identities,
  created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, revoked_at timestamptz,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '1 hour 5 seconds')
);
CREATE INDEX gp_sol_sessions_expiry ON public.gp_sol_sessions(expires_at);
CREATE FUNCTION public.gp_sol_issue_challenge(p_rate_key text,p_wallet text,p_nonce text,p_binding_hash text,p_message text,p_expires_at timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE result uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_rate_key, 732));
  IF (SELECT count(*) FROM public.gp_sol_challenges WHERE rate_key=p_rate_key AND issued_at > now()-interval '1 minute') >= 10 THEN RAISE EXCEPTION 'Authentication IP rate limit'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_wallet, 731));
  IF (SELECT count(*) FROM public.gp_sol_challenges WHERE wallet_address=p_wallet AND issued_at > now()-interval '1 minute') >= 5 THEN
    RAISE EXCEPTION 'Authentication rate limit';
  END IF;
  IF EXISTS (SELECT 1 FROM public.gp_sol_identities WHERE wallet_address=p_wallet AND banned) THEN RAISE EXCEPTION 'Wallet unavailable'; END IF;
  INSERT INTO public.gp_sol_challenges(wallet_address,nonce,rate_key,binding_hash,message,expires_at) VALUES(p_wallet,p_nonce,p_rate_key,p_binding_hash,p_message,p_expires_at) RETURNING id INTO result;
  RETURN result;
END $$;
CREATE FUNCTION public.gp_sol_consume_challenge(p_id uuid,p_binding_hash text)
RETURNS TABLE(wallet_address text,message text) LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  UPDATE public.gp_sol_challenges SET consumed_at=now() WHERE id=p_id AND binding_hash=p_binding_hash AND consumed_at IS NULL AND expires_at > now()
  RETURNING wallet_address,message;
$$;
CREATE FUNCTION public.gp_sol_create_session(p_wallet text,p_token_hash text,p_expires_at timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_wallet, 731));
  INSERT INTO public.gp_sol_identities(wallet_address) VALUES(p_wallet) ON CONFLICT DO NOTHING;
  IF EXISTS (SELECT 1 FROM public.gp_sol_identities WHERE wallet_address=p_wallet AND banned) THEN RAISE EXCEPTION 'Wallet unavailable'; END IF;
  INSERT INTO public.gp_sol_sessions(token_hash,wallet_address,expires_at) VALUES(p_token_hash,p_wallet,p_expires_at);
END $$;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['gp_sol_identities','gp_sol_challenges','gp_sol_sessions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO service_role',t);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.gp_sol_issue_challenge(text,text,text,text,text,timestamptz),public.gp_sol_consume_challenge(uuid,text),public.gp_sol_create_session(text,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gp_sol_issue_challenge(text,text,text,text,text,timestamptz),public.gp_sol_consume_challenge(uuid,text),public.gp_sol_create_session(text,text,timestamptz) TO service_role;
COMMIT;
