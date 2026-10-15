-- Additive SOL foundation. No legacy users, balances, function bodies, or grants are changed.
-- Apply individually only after backup and staging checks. Financial activation stays disabled.
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
CREATE TABLE public.gp_sol_sessions (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  wallet_address text NOT NULL REFERENCES public.gp_sol_identities,
  created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, revoked_at timestamptz,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '1 hour 5 seconds')
);
CREATE INDEX gp_sol_sessions_expiry ON public.gp_sol_sessions(expires_at);
CREATE TABLE public.gp_sol_launches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), creator_wallet text NOT NULL REFERENCES public.gp_sol_identities,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 32), symbol text NOT NULL CHECK (symbol ~ '^[A-Z0-9]{1,10}$'),
  description text NOT NULL CHECK (length(description) <= 2000), metadata jsonb NOT NULL DEFAULT '{}',
  mint_address text UNIQUE, pool_address text UNIQUE, platform_config text,
  creation_signature text UNIQUE, provenance_verified_at timestamptz,
  lifecycle text NOT NULL DEFAULT 'draft' CHECK (lifecycle IN ('draft','pending','curve','graduating','graduated','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (lifecycle NOT IN ('curve','graduating','graduated') OR (mint_address IS NOT NULL AND pool_address IS NOT NULL AND creation_signature IS NOT NULL AND provenance_verified_at IS NOT NULL))
);
CREATE TABLE public.gp_sol_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), advertiser_wallet text NOT NULL REFERENCES public.gp_sol_identities,
  token_mint text NOT NULL, package text NOT NULL CHECK (package IN ('watch','learn')),
  official_creator boolean NOT NULL DEFAULT false, moderation text NOT NULL DEFAULT 'pending' CHECK (moderation IN ('pending','approved','rejected','suspended')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','funded','active','paused','completed')),
  reward_lamports bigint NOT NULL DEFAULT 0 CHECK (reward_lamports >= 0),
  reserve_lamports bigint NOT NULL DEFAULT 0 CHECK (reserve_lamports >= 0),
  spent_lamports bigint NOT NULL DEFAULT 0 CHECK (spent_lamports >= 0 AND spent_lamports <= reserve_lamports),
  max_completions integer NOT NULL DEFAULT 0 CHECK (max_completions >= 0),
  verified_completions integer NOT NULL DEFAULT 0 CHECK (verified_completions >= 0 AND verified_completions <= max_completions),
  starts_at timestamptz, ends_at timestamptz, allocation_approval_id uuid,
  funding_signature text UNIQUE, funding_verified_at timestamptz,
  CHECK (ends_at IS NULL OR ends_at > starts_at),
  CHECK (status <> 'active' OR (moderation = 'approved' AND allocation_approval_id IS NOT NULL AND funding_verified_at IS NOT NULL AND funding_signature IS NOT NULL AND reserve_lamports >= reward_lamports::numeric * max_completions))
);
CREATE TABLE public.gp_sol_engagements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL REFERENCES public.gp_sol_campaigns,
  wallet_address text NOT NULL REFERENCES public.gp_sol_identities, started_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz, review text CHECK (length(review) <= 2000),
  compensated boolean NOT NULL DEFAULT true, verification jsonb NOT NULL DEFAULT '{}',
  UNIQUE (campaign_id, wallet_address)
);
CREATE TABLE public.gp_sol_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_wallet text REFERENCES public.gp_sol_identities,
  category text NOT NULL CHECK (category IN ('treasury_asset','launch_revenue','platform_trading_revenue','creator_liability','campaign_reserve','member_liability','advertising_revenue','referral_liability','operations_reserve','withdrawal_revenue','network_cost')),
  chain_wallet text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.gp_sol_journals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), idempotency_key text UNIQUE NOT NULL,
  event_type text NOT NULL, debit_account uuid NOT NULL REFERENCES public.gp_sol_accounts,
  credit_account uuid NOT NULL REFERENCES public.gp_sol_accounts,
  amount_lamports bigint NOT NULL CHECK (amount_lamports > 0),
  chain_signature text, metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (debit_account <> credit_account)
);
-- Each immutable journal has equal debit and credit amounts by construction.
CREATE TABLE public.gp_sol_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), wallet_address text NOT NULL REFERENCES public.gp_sol_identities,
  idempotency_key text UNIQUE NOT NULL, gross_lamports bigint NOT NULL CHECK (gross_lamports > 0),
  fee_lamports bigint NOT NULL CHECK (fee_lamports >= 0 AND fee_lamports < gross_lamports),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','reserved','submitted','confirmed','failed','manual_review')),
  chain_signature text UNIQUE, created_at timestamptz NOT NULL DEFAULT now(), confirmed_at timestamptz,
  CHECK (status NOT IN ('submitted','confirmed') OR chain_signature IS NOT NULL)
);
CREATE TABLE public.gp_sol_referrals (
  referee_wallet text PRIMARY KEY REFERENCES public.gp_sol_identities,
  referrer_wallet text NOT NULL REFERENCES public.gp_sol_identities,
  verified_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), CHECK (referee_wallet <> referrer_wallet)
);
CREATE TABLE public.gp_sol_admin_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_user_id uuid NOT NULL,
  action text NOT NULL, details jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION public.gp_sol_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN RAISE EXCEPTION 'Immutable audit record: append a compensating entry'; END $$;
CREATE TRIGGER gp_sol_journals_immutable BEFORE UPDATE OR DELETE ON public.gp_sol_journals FOR EACH ROW EXECUTE FUNCTION public.gp_sol_immutable();
CREATE TRIGGER gp_sol_actions_immutable BEFORE UPDATE OR DELETE ON public.gp_sol_admin_actions FOR EACH ROW EXECUTE FUNCTION public.gp_sol_immutable();
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
  FOREACH t IN ARRAY ARRAY['gp_sol_identities','gp_sol_challenges','gp_sol_sessions','gp_sol_launches','gp_sol_campaigns','gp_sol_engagements','gp_sol_accounts','gp_sol_journals','gp_sol_withdrawals','gp_sol_referrals','gp_sol_admin_actions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO service_role',t);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.gp_sol_issue_challenge(text,text,text,text,text,timestamptz),public.gp_sol_consume_challenge(uuid,text),public.gp_sol_create_session(text,text,timestamptz),public.gp_sol_immutable() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gp_sol_issue_challenge(text,text,text,text,text,timestamptz),public.gp_sol_consume_challenge(uuid,text),public.gp_sol_create_session(text,text,timestamptz) TO service_role;
COMMIT;
