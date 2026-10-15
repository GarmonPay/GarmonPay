-- LOCAL SYNTHETIC STAGING ONLY. No production migration or financial activation.
BEGIN;
CREATE TABLE public.gp_sol_view_budgets (
 campaign_id uuid PRIMARY KEY REFERENCES public.gp_sol_campaigns,
 viewer_reserve bigint NOT NULL CHECK(viewer_reserve>=0), referral_reserve bigint NOT NULL CHECK(referral_reserve>=0),
 viewer_spent bigint NOT NULL DEFAULT 0 CHECK(viewer_spent>=0 AND viewer_spent<=viewer_reserve),
 referral_spent bigint NOT NULL DEFAULT 0 CHECK(referral_spent>=0 AND referral_spent<=referral_reserve),
 reward_lamports bigint NOT NULL CHECK(reward_lamports>0), required_seconds integer NOT NULL CHECK(required_seconds IN(5,15,30)),
 daily_limit integer NOT NULL CHECK(daily_limit BETWEEN 1 AND 1000), funding_reference text UNIQUE NOT NULL,
 CHECK(length(funding_reference) BETWEEN 1 AND 100)
);
CREATE TABLE public.gp_sol_view_proofs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL REFERENCES public.gp_sol_view_budgets,
 viewer_wallet text NOT NULL REFERENCES public.gp_sol_identities,
 started_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 verifier_reference text UNIQUE NOT NULL CHECK(length(verifier_reference) BETWEEN 1 AND 100),
 verified_at timestamptz, risk_approved boolean NOT NULL DEFAULT false,
 CHECK(expires_at>started_at AND expires_at<=started_at+interval '15 minutes'),
 CHECK(verified_at IS NULL OR (verified_at>=started_at AND verified_at<=expires_at))
);
CREATE TABLE public.gp_sol_view_awards (
 proof_id uuid PRIMARY KEY REFERENCES public.gp_sol_view_proofs, campaign_id uuid NOT NULL REFERENCES public.gp_sol_campaigns,
 viewer_wallet text NOT NULL REFERENCES public.gp_sol_identities, reward_lamports bigint NOT NULL CHECK(reward_lamports>0),
 referrer_wallet text REFERENCES public.gp_sol_identities, referral_lamports bigint NOT NULL CHECK(referral_lamports>=0),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(campaign_id,viewer_wallet),
 CHECK(referrer_wallet IS NULL OR referrer_wallet<>viewer_wallet),
 CHECK((referrer_wallet IS NULL AND referral_lamports=0) OR (referrer_wallet IS NOT NULL AND referral_lamports BETWEEN reward_lamports/2 AND (reward_lamports+1)/2))
);
CREATE TRIGGER gp_sol_view_awards_immutable BEFORE UPDATE OR DELETE ON public.gp_sol_view_awards FOR EACH ROW EXECUTE FUNCTION public.gp_sol_immutable();
CREATE FUNCTION public.gp_sol_claim_verified_view(p_proof uuid,p_viewer text) RETURNS uuid
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE proof public.gp_sol_view_proofs; budget public.gp_sol_view_budgets; campaign public.gp_sol_campaigns;
 referrer text; match bigint:=0; prior public.gp_sol_view_awards;
BEGIN
 SELECT * INTO proof FROM public.gp_sol_view_proofs WHERE id=p_proof;
 IF NOT FOUND OR proof.viewer_wallet IS DISTINCT FROM p_viewer THEN RAISE EXCEPTION 'View proof unavailable'; END IF;
 -- Consistent campaign budget then viewer lock order across all claims.
 SELECT * INTO budget FROM public.gp_sol_view_budgets WHERE campaign_id=proof.campaign_id FOR UPDATE;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_viewer,733));
 SELECT * INTO prior FROM public.gp_sol_view_awards WHERE proof_id=p_proof;
 IF FOUND THEN RETURN prior.proof_id; END IF;
 SELECT * INTO proof FROM public.gp_sol_view_proofs WHERE id=p_proof FOR UPDATE;
 SELECT * INTO campaign FROM public.gp_sol_campaigns WHERE id=proof.campaign_id FOR SHARE;
 IF campaign.status<>'active' OR campaign.moderation<>'approved' OR campaign.verified_completions>=campaign.max_completions OR (campaign.starts_at IS NOT NULL AND campaign.starts_at>now()) OR (campaign.ends_at IS NOT NULL AND campaign.ends_at<=now()) THEN RAISE EXCEPTION 'Campaign unavailable'; END IF;
 IF proof.verified_at IS NULL OR NOT proof.risk_approved OR proof.expires_at<=now() OR proof.verified_at>now() OR proof.verified_at<proof.started_at+make_interval(secs=>budget.required_seconds) THEN RAISE EXCEPTION 'Verified viewing time and eligibility required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.gp_sol_identities WHERE wallet_address=p_viewer AND NOT banned) OR p_viewer=campaign.advertiser_wallet THEN RAISE EXCEPTION 'Viewer ineligible'; END IF;
 IF (SELECT count(*) FROM public.gp_sol_view_awards WHERE viewer_wallet=p_viewer AND created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')>=budget.daily_limit THEN RAISE EXCEPTION 'Daily view limit'; END IF;
 SELECT r.referrer_wallet INTO referrer FROM public.gp_sol_referrals r JOIN public.gp_sol_identities i ON i.wallet_address=r.referrer_wallet WHERE campaign.package='watch' AND r.referee_wallet=p_viewer AND r.verified_at IS NOT NULL AND NOT i.banned AND r.referrer_wallet<>campaign.advertiser_wallet;
 IF referrer IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_viewer||':'||referrer,734));
  SELECT floor((coalesce(sum(reward_lamports),0)+budget.reward_lamports)/2)-coalesce(sum(referral_lamports),0) INTO match
  FROM public.gp_sol_view_awards WHERE viewer_wallet=p_viewer AND referrer_wallet=referrer;
 END IF;
 IF budget.viewer_reserve-budget.viewer_spent<budget.reward_lamports OR budget.referral_reserve-budget.referral_spent<match THEN RAISE EXCEPTION 'Insufficient funded obligations'; END IF;
 INSERT INTO public.gp_sol_view_awards(proof_id,campaign_id,viewer_wallet,reward_lamports,referrer_wallet,referral_lamports) VALUES(p_proof,proof.campaign_id,p_viewer,budget.reward_lamports,referrer,match);
 UPDATE public.gp_sol_view_budgets SET viewer_spent=viewer_spent+budget.reward_lamports,referral_spent=referral_spent+match WHERE campaign_id=proof.campaign_id;
 UPDATE public.gp_sol_campaigns SET verified_completions=verified_completions+1,status=CASE WHEN verified_completions+1=max_completions THEN 'completed' ELSE status END WHERE id=proof.campaign_id;
 RETURN p_proof;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['gp_sol_view_budgets','gp_sol_view_proofs','gp_sol_view_awards'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
 END LOOP;
END $$;
GRANT SELECT,INSERT,UPDATE ON public.gp_sol_view_budgets,public.gp_sol_view_proofs TO service_role;
GRANT SELECT,INSERT ON public.gp_sol_view_awards TO service_role;
REVOKE ALL ON FUNCTION public.gp_sol_claim_verified_view(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gp_sol_claim_verified_view(uuid,text) TO service_role;
COMMIT;
