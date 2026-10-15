-- LOCAL ONLY: foundation + deposits + verified views required. No live migration.
BEGIN;
CREATE TABLE public.gp_sol_campaign_quotes (
 campaign_id uuid PRIMARY KEY REFERENCES public.gp_sol_campaigns,
 pricing_version text NOT NULL CHECK(length(pricing_version) BETWEEN 1 AND 100),
 seconds integer NOT NULL CHECK(seconds IN(5,15,30)), views integer NOT NULL CHECK(views BETWEEN 1000 AND 1000000 AND views%1000=0),
 purchase_microusd bigint NOT NULL CHECK(purchase_microusd>=5000000),
 sol_price_microusd bigint NOT NULL CHECK(sol_price_microusd>0),
 gross_lamports bigint NOT NULL CHECK(gross_lamports>0), reward_lamports bigint NOT NULL CHECK(reward_lamports>0),
 observed_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
 CHECK(expires_at=observed_at+interval '60 seconds'),
 CHECK(purchase_microusd=(CASE seconds WHEN 5 THEN 3000000 WHEN 15 THEN 8000000 WHEN 30 THEN 15000000 END)::bigint*(views/1000)),
 CHECK(gross_lamports=ceil(purchase_microusd::numeric*1000000000/sol_price_microusd)),
 CHECK(reward_lamports=ceil((CASE seconds WHEN 5 THEN 300 WHEN 15 THEN 1000 WHEN 30 THEN 2000 END)::numeric*1000000000/sol_price_microusd))
);
CREATE TRIGGER gp_sol_quotes_immutable BEFORE UPDATE OR DELETE ON public.gp_sol_campaign_quotes FOR EACH ROW EXECUTE FUNCTION public.gp_sol_immutable();
ALTER TABLE public.gp_sol_view_budgets ADD COLUMN funding_receipt uuid UNIQUE REFERENCES public.gp_sol_settlement_receipts,
 ADD COLUMN viewer_account uuid REFERENCES public.gp_sol_accounts,
 ADD COLUMN referral_account uuid REFERENCES public.gp_sol_accounts;
CREATE TABLE public.gp_sol_campaign_purchases (
 campaign_id uuid PRIMARY KEY REFERENCES public.gp_sol_campaigns,
 receipt_id uuid UNIQUE NOT NULL REFERENCES public.gp_sol_settlement_receipts,
 advertiser_wallet text NOT NULL REFERENCES public.gp_sol_identities,
 source_account uuid NOT NULL REFERENCES public.gp_sol_accounts,
 viewer_account uuid NOT NULL REFERENCES public.gp_sol_accounts,
 referral_account uuid NOT NULL REFERENCES public.gp_sol_accounts,
 allocated_lamports bigint NOT NULL CHECK(allocated_lamports>0),
 created_at timestamptz NOT NULL DEFAULT now(), CHECK(viewer_account<>referral_account)
);
CREATE TRIGGER gp_sol_purchases_immutable BEFORE UPDATE OR DELETE ON public.gp_sol_campaign_purchases FOR EACH ROW EXECUTE FUNCTION public.gp_sol_immutable();
CREATE FUNCTION public.gp_sol_account_balance(p_account uuid) RETURNS numeric LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(sum(CASE WHEN credit_account=p_account THEN amount_lamports ELSE -amount_lamports END),0)
 FROM public.gp_sol_journals WHERE debit_account=p_account OR credit_account=p_account
$$;
CREATE FUNCTION public.gp_sol_fund_campaign(p_campaign uuid,p_receipt uuid,p_reward bigint,p_seconds integer,p_daily_limit integer)
 RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.gp_sol_campaigns; r public.gp_sol_settlement_receipts; i public.gp_sol_settlement_intents;
 q public.gp_sol_campaign_quotes;
 prior public.gp_sol_campaign_purchases; viewer_account uuid; referral_account uuid;
 viewer_total bigint; referral_total bigint;
BEGIN
 SELECT * INTO c FROM public.gp_sol_campaigns WHERE id=p_campaign FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Campaign unavailable'; END IF;
 SELECT * INTO prior FROM public.gp_sol_campaign_purchases WHERE campaign_id=p_campaign;
 IF FOUND THEN
  IF prior.receipt_id<>p_receipt OR NOT EXISTS(SELECT 1 FROM public.gp_sol_view_budgets WHERE campaign_id=p_campaign AND reward_lamports=p_reward AND required_seconds=p_seconds AND daily_limit=p_daily_limit) THEN RAISE EXCEPTION 'Funding replay conflicts'; END IF;
  RETURN p_campaign;
 END IF;
 IF c.status<>'draft' OR c.moderation<>'approved' OR c.max_completions<1000 OR c.max_completions%1000<>0 OR c.max_completions>1000000 OR p_reward IS NULL OR p_reward<=0 OR p_seconds IS NULL OR p_seconds NOT IN(5,15,30) OR p_daily_limit IS NULL OR p_daily_limit NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Approved bounded campaign terms required'; END IF;
 SELECT * INTO q FROM public.gp_sol_campaign_quotes WHERE campaign_id=p_campaign;
 IF NOT FOUND OR q.observed_at>now() OR q.expires_at<=now() OR q.views<>c.max_completions OR q.reward_lamports<>p_reward OR q.seconds<>p_seconds THEN RAISE EXCEPTION 'Approved unexpired campaign quote required'; END IF;
 SELECT * INTO r FROM public.gp_sol_settlement_receipts WHERE id=p_receipt;
 IF NOT FOUND THEN RAISE EXCEPTION 'Finalized settlement receipt required'; END IF;
 SELECT * INTO i FROM public.gp_sol_settlement_intents WHERE id=r.intent_id;
 IF r.amount_lamports<>q.gross_lamports OR r.block_time<q.observed_at OR r.block_time>q.expires_at THEN RAISE EXCEPTION 'Settlement conflicts with campaign quote'; END IF;
 IF i.status<>'posted' OR i.actor_wallet<>c.advertiser_wallet OR NOT EXISTS(SELECT 1 FROM public.gp_sol_journals WHERE id=r.journal_id AND event_type='gp_sol_deposit' AND credit_account=i.liability_account AND amount_lamports=r.amount_lamports) THEN RAISE EXCEPTION 'Funding ownership or ledger mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.gp_sol_identities WHERE wallet_address=c.advertiser_wallet AND NOT banned) THEN RAISE EXCEPTION 'Advertiser unavailable'; END IF;
 PERFORM id FROM public.gp_sol_accounts WHERE id=i.liability_account FOR UPDATE;
 viewer_total:=p_reward*c.max_completions::bigint;
 -- Carry rounding may consume ceil(reward/2) per view; unused dust stays reserved.
 referral_total:=((p_reward+1)/2)*c.max_completions::bigint;
 IF viewer_total::numeric+referral_total>r.amount_lamports OR public.gp_sol_account_balance(i.liability_account)<viewer_total::numeric+referral_total THEN RAISE EXCEPTION 'Insufficient receipt-backed funding'; END IF;
 INSERT INTO public.gp_sol_accounts(category) VALUES('campaign_reserve') RETURNING id INTO viewer_account;
 INSERT INTO public.gp_sol_accounts(category) VALUES('campaign_reserve') RETURNING id INTO referral_account;
 INSERT INTO public.gp_sol_journals(idempotency_key,event_type,debit_account,credit_account,amount_lamports,metadata)
 VALUES('campaign-viewer:'||p_campaign,'campaign_funding',i.liability_account,viewer_account,viewer_total,jsonb_build_object('receipt',p_receipt,'campaign',p_campaign)),
 ('campaign-referral:'||p_campaign,'campaign_funding',i.liability_account,referral_account,referral_total,jsonb_build_object('receipt',p_receipt,'campaign',p_campaign));
 INSERT INTO public.gp_sol_view_budgets(campaign_id,viewer_reserve,referral_reserve,reward_lamports,required_seconds,daily_limit,funding_reference,funding_receipt,viewer_account,referral_account)
 VALUES(p_campaign,viewer_total,referral_total,p_reward,p_seconds,p_daily_limit,p_receipt::text,p_receipt,viewer_account,referral_account);
 UPDATE public.gp_sol_campaigns SET status='active',reward_lamports=p_reward,reserve_lamports=viewer_total,allocation_approval_id=p_campaign,funding_signature=r.signature,funding_verified_at=r.created_at WHERE id=p_campaign;
 INSERT INTO public.gp_sol_campaign_purchases VALUES(p_campaign,p_receipt,c.advertiser_wallet,i.liability_account,viewer_account,referral_account,viewer_total+referral_total,now());
 RETURN p_campaign;
END $$;
CREATE FUNCTION public.gp_sol_post_view_award() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE b public.gp_sol_view_budgets; member_account uuid; referrer_account uuid;
BEGIN
 SELECT * INTO b FROM public.gp_sol_view_budgets WHERE campaign_id=NEW.campaign_id FOR UPDATE;
 IF b.funding_receipt IS NULL OR NOT EXISTS(SELECT 1 FROM public.gp_sol_campaign_purchases WHERE campaign_id=NEW.campaign_id AND receipt_id=b.funding_receipt AND viewer_account=b.viewer_account AND referral_account=b.referral_account) THEN RAISE EXCEPTION 'Receipt-backed campaign allocation required'; END IF;
 IF public.gp_sol_account_balance(b.viewer_account)<NEW.reward_lamports OR public.gp_sol_account_balance(b.referral_account)<NEW.referral_lamports THEN RAISE EXCEPTION 'Ledger reserve exhausted'; END IF;
 -- Create one canonical reward liability per identity under its independent lock.
 PERFORM pg_advisory_xact_lock(742);
 SELECT id INTO member_account FROM public.gp_sol_accounts WHERE category='member_liability' AND owner_wallet=NEW.viewer_wallet ORDER BY created_at,id LIMIT 1;
 IF member_account IS NULL THEN INSERT INTO public.gp_sol_accounts(category,owner_wallet) VALUES('member_liability',NEW.viewer_wallet) RETURNING id INTO member_account; END IF;
 INSERT INTO public.gp_sol_journals(idempotency_key,event_type,debit_account,credit_account,amount_lamports,metadata)
 VALUES('view:'||NEW.proof_id,'verified_view_reward',b.viewer_account,member_account,NEW.reward_lamports,jsonb_build_object('proof',NEW.proof_id,'campaign',NEW.campaign_id,'wallet',NEW.viewer_wallet));
 IF NEW.referral_lamports>0 THEN
  SELECT id INTO referrer_account FROM public.gp_sol_accounts WHERE category='member_liability' AND owner_wallet=NEW.referrer_wallet ORDER BY created_at,id LIMIT 1;
  IF referrer_account IS NULL THEN INSERT INTO public.gp_sol_accounts(category,owner_wallet) VALUES('member_liability',NEW.referrer_wallet) RETURNING id INTO referrer_account; END IF;
  INSERT INTO public.gp_sol_journals(idempotency_key,event_type,debit_account,credit_account,amount_lamports,metadata)
  VALUES('view-referral:'||NEW.proof_id,'viewer_referral_match',b.referral_account,referrer_account,NEW.referral_lamports,jsonb_build_object('proof',NEW.proof_id,'campaign',NEW.campaign_id,'viewer',NEW.viewer_wallet,'wallet',NEW.referrer_wallet));
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER gp_sol_awards_post_ledger AFTER INSERT ON public.gp_sol_view_awards FOR EACH ROW EXECUTE FUNCTION public.gp_sol_post_view_award();
CREATE FUNCTION public.gp_sol_preserve_campaign_binding() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.gp_sol_campaign_purchases WHERE campaign_id=OLD.id) AND
 (NEW.advertiser_wallet,NEW.package,NEW.max_completions,NEW.reward_lamports,NEW.reserve_lamports,NEW.allocation_approval_id,NEW.funding_signature,NEW.funding_verified_at)
 IS DISTINCT FROM
 (OLD.advertiser_wallet,OLD.package,OLD.max_completions,OLD.reward_lamports,OLD.reserve_lamports,OLD.allocation_approval_id,OLD.funding_signature,OLD.funding_verified_at) THEN RAISE EXCEPTION 'Funded campaign binding is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER gp_sol_campaign_binding BEFORE UPDATE ON public.gp_sol_campaigns FOR EACH ROW EXECUTE FUNCTION public.gp_sol_preserve_campaign_binding();
CREATE FUNCTION public.gp_sol_preserve_budget_binding() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF (to_jsonb(NEW)-'viewer_spent'-'referral_spent') IS DISTINCT FROM (to_jsonb(OLD)-'viewer_spent'-'referral_spent') THEN RAISE EXCEPTION 'Funded budget binding is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER gp_sol_budget_binding BEFORE UPDATE ON public.gp_sol_view_budgets FOR EACH ROW EXECUTE FUNCTION public.gp_sol_preserve_budget_binding();
CREATE VIEW public.gp_sol_campaign_reconciliation WITH(security_invoker=true) AS
 SELECT b.campaign_id,b.funding_receipt,
 public.gp_sol_account_balance(b.viewer_account) AS viewer_balance,
 public.gp_sol_account_balance(b.referral_account) AS referral_balance,
 (public.gp_sol_account_balance(b.viewer_account)=b.viewer_reserve-b.viewer_spent AND
 public.gp_sol_account_balance(b.referral_account)=b.referral_reserve-b.referral_spent AND
 b.viewer_spent=(SELECT coalesce(sum(a.reward_lamports),0) FROM public.gp_sol_view_awards a WHERE a.campaign_id=b.campaign_id) AND
 b.referral_spent=(SELECT coalesce(sum(a.referral_lamports),0) FROM public.gp_sol_view_awards a WHERE a.campaign_id=b.campaign_id) AND
 NOT EXISTS(SELECT 1 FROM public.gp_sol_view_awards a WHERE a.campaign_id=b.campaign_id AND
 (NOT EXISTS(SELECT 1 FROM public.gp_sol_journals j JOIN public.gp_sol_accounts m ON m.id=j.credit_account WHERE j.idempotency_key='view:'||a.proof_id AND j.debit_account=b.viewer_account AND j.amount_lamports=a.reward_lamports AND m.owner_wallet=a.viewer_wallet AND m.category='member_liability') OR
 (a.referral_lamports>0 AND NOT EXISTS(SELECT 1 FROM public.gp_sol_journals j JOIN public.gp_sol_accounts m ON m.id=j.credit_account WHERE j.idempotency_key='view-referral:'||a.proof_id AND j.debit_account=b.referral_account AND j.amount_lamports=a.referral_lamports AND m.owner_wallet=a.referrer_wallet AND m.category='member_liability'))))) AS reconciled
 FROM public.gp_sol_view_budgets b WHERE b.funding_receipt IS NOT NULL;
REVOKE ALL ON public.gp_sol_campaign_reconciliation FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.gp_sol_campaign_reconciliation TO service_role;
ALTER TABLE public.gp_sol_campaign_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gp_sol_campaign_quotes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gp_sol_campaign_quotes FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.gp_sol_campaign_quotes TO service_role;
REVOKE ALL ON public.gp_sol_campaign_purchases FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.gp_sol_campaign_purchases TO service_role;
REVOKE ALL ON FUNCTION public.gp_sol_fund_campaign(uuid,uuid,bigint,integer,integer),public.gp_sol_account_balance(uuid),public.gp_sol_post_view_award() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.gp_sol_preserve_campaign_binding(),public.gp_sol_preserve_budget_binding() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gp_sol_fund_campaign(uuid,uuid,bigint,integer,integer),public.gp_sol_account_balance(uuid),public.gp_sol_post_view_award() TO service_role;
COMMIT;
