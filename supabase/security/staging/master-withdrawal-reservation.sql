-- LOCAL ONLY. Reserves ledger funds; never signs/broadcasts a withdrawal.
BEGIN;
ALTER TABLE public.gp_sol_accounts DROP CONSTRAINT gp_sol_accounts_category_check;
ALTER TABLE public.gp_sol_accounts ADD CONSTRAINT gp_sol_accounts_category_check CHECK(category IN('treasury_asset','launch_revenue','platform_trading_revenue','creator_liability','campaign_reserve','member_liability','advertising_revenue','referral_liability','operations_reserve','withdrawal_revenue','network_cost','withdrawal_hold'));
CREATE TABLE public.gp_sol_withdrawal_reservations (
 withdrawal_id uuid PRIMARY KEY REFERENCES public.gp_sol_withdrawals,
 source_account uuid NOT NULL REFERENCES public.gp_sol_accounts,
 hold_account uuid UNIQUE NOT NULL REFERENCES public.gp_sol_accounts,
 destination_wallet text NOT NULL REFERENCES public.gp_sol_identities,
 price_microusd bigint NOT NULL CHECK(price_microusd>0),
 rate_observed_at timestamptz NOT NULL, quote_expires_at timestamptz NOT NULL,
 journal_id uuid UNIQUE NOT NULL REFERENCES public.gp_sol_journals,
 CHECK(quote_expires_at=rate_observed_at+interval '60 seconds')
);
CREATE TRIGGER gp_sol_withdrawal_reservations_immutable BEFORE UPDATE OR DELETE ON public.gp_sol_withdrawal_reservations FOR EACH ROW EXECUTE FUNCTION public.gp_sol_immutable();
CREATE FUNCTION public.gp_sol_reserve_withdrawal(p_wallet text,p_key text,p_gross bigint,p_fee bigint,p_price bigint,p_observed timestamptz)
 RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE prior public.gp_sol_withdrawals; source uuid; hold uuid; withdrawal uuid; journal uuid;
BEGIN
 IF p_key IS NULL OR p_key !~ '^[A-Za-z0-9_-]{1,100}$' THEN RAISE EXCEPTION 'Stable withdrawal reference required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_wallet,745));
 SELECT * INTO prior FROM public.gp_sol_withdrawals WHERE idempotency_key=p_key;
 IF FOUND THEN
  IF prior.wallet_address<>p_wallet OR prior.gross_lamports IS DISTINCT FROM p_gross OR prior.fee_lamports IS DISTINCT FROM p_fee OR NOT EXISTS(SELECT 1 FROM public.gp_sol_withdrawal_reservations WHERE withdrawal_id=prior.id AND price_microusd=p_price AND rate_observed_at=p_observed) THEN RAISE EXCEPTION 'Withdrawal replay conflicts'; END IF;
  RETURN prior.id;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.gp_sol_identities WHERE wallet_address=p_wallet AND NOT banned) THEN RAISE EXCEPTION 'Withdrawal identity unavailable'; END IF;
 IF p_price IS NULL OR p_price<=0 OR p_observed IS NULL OR p_observed>now() OR p_observed+interval '60 seconds'<=now() OR p_gross IS NULL OR p_gross<=0 OR p_fee IS NULL OR p_fee<0 OR p_fee>=p_gross THEN RAISE EXCEPTION 'Approved fresh withdrawal quote required'; END IF;
 IF p_gross::numeric*p_price<2000000::numeric*1000000000 THEN RAISE EXCEPTION '$2 minimum withdrawal required'; END IF;
 SELECT id INTO source FROM public.gp_sol_accounts WHERE category='member_liability' AND owner_wallet=p_wallet ORDER BY created_at,id LIMIT 1 FOR UPDATE;
 IF source IS NULL OR public.gp_sol_account_balance(source)<p_gross THEN RAISE EXCEPTION 'Insufficient available ledger funds'; END IF;
 INSERT INTO public.gp_sol_accounts(category,owner_wallet) VALUES('withdrawal_hold',p_wallet) RETURNING id INTO hold;
 INSERT INTO public.gp_sol_withdrawals(wallet_address,idempotency_key,gross_lamports,fee_lamports,status) VALUES(p_wallet,p_key,p_gross,p_fee,'reserved') RETURNING id INTO withdrawal;
 INSERT INTO public.gp_sol_journals(idempotency_key,event_type,debit_account,credit_account,amount_lamports,metadata)
 VALUES('withdrawal-reserve:'||withdrawal,'withdrawal_reservation',source,hold,p_gross,jsonb_build_object('withdrawal',withdrawal,'wallet',p_wallet,'fee_lamports',p_fee)) RETURNING id INTO journal;
 INSERT INTO public.gp_sol_withdrawal_reservations VALUES(withdrawal,source,hold,p_wallet,p_price,p_observed,p_observed+interval '60 seconds',journal);
 RETURN withdrawal;
END $$;
ALTER TABLE public.gp_sol_withdrawal_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gp_sol_withdrawal_reservations FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.gp_sol_withdrawal_reservations TO service_role;
REVOKE ALL ON FUNCTION public.gp_sol_reserve_withdrawal(text,text,bigint,bigint,bigint,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gp_sol_reserve_withdrawal(text,text,bigint,bigint,bigint,timestamptz) TO service_role;
COMMIT;
