-- Referral recurring commissions: pay referrers in GPay Coins (gpay_coins), not users.balance.
-- Amount in transactions / commission rows stays the same integer as before (USD cents face value = GPC count: 100 GPC = $1).

CREATE OR REPLACE FUNCTION public.process_subscription_billing(p_subscription_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sub record;
  v_period_end date;
  v_referrer_id uuid;
  v_referrer_code text;
  v_pct numeric;
  v_commission_cents bigint;
  v_gpc integer;
  v_rc_id uuid;
  v_coin_ref text;
BEGIN
  SELECT * INTO v_sub FROM public.subscriptions WHERE id = p_subscription_id FOR UPDATE;
  IF v_sub IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Subscription not found');
  END IF;
  IF v_sub.status != 'active' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Subscription not active');
  END IF;

  v_period_end := v_sub.next_billing_date;
  IF v_period_end > CURRENT_DATE THEN
    RETURN jsonb_build_object('success', false, 'message', 'Billing date not yet due');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.subscription_payments
    WHERE subscription_id = p_subscription_id AND period_end_date = v_period_end
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Already paid for this period');
  END IF;
  INSERT INTO public.subscription_payments (subscription_id, period_end_date)
  VALUES (p_subscription_id, v_period_end);

  SELECT u.referred_by_code INTO v_referrer_code FROM public.users u WHERE u.id = v_sub.user_id;
  IF v_referrer_code IS NULL OR trim(v_referrer_code) = '' THEN
    UPDATE public.subscriptions SET next_billing_date = v_period_end + interval '1 month', updated_at = now() WHERE id = p_subscription_id;
    RETURN jsonb_build_object('success', true, 'commissionPaid', false, 'reason', 'no_referrer');
  END IF;
  SELECT id INTO v_referrer_id FROM public.users WHERE referral_code = v_referrer_code;
  IF v_referrer_id IS NULL OR v_referrer_id = v_sub.user_id THEN
    UPDATE public.subscriptions SET next_billing_date = v_period_end + interval '1 month', updated_at = now() WHERE id = p_subscription_id;
    RETURN jsonb_build_object('success', true, 'commissionPaid', false, 'reason', 'no_referrer');
  END IF;

  SELECT commission_percentage INTO v_pct FROM public.referral_commission_config WHERE membership_tier = v_sub.membership_tier;
  IF v_pct IS NULL THEN
    v_pct := 10;
  END IF;
  v_commission_cents := round(v_sub.monthly_price * v_pct / 100)::bigint;
  IF v_commission_cents <= 0 THEN
    UPDATE public.subscriptions SET next_billing_date = v_period_end + interval '1 month', updated_at = now() WHERE id = p_subscription_id;
    RETURN jsonb_build_object('success', true, 'commissionPaid', false, 'reason', 'zero_commission');
  END IF;

  INSERT INTO public.referral_commissions (referrer_user_id, referred_user_id, subscription_id, commission_amount, last_paid_date, status)
  VALUES (v_referrer_id, v_sub.user_id, p_subscription_id, v_commission_cents, v_period_end, 'active')
  ON CONFLICT (referrer_user_id, referred_user_id, subscription_id) DO UPDATE SET
    commission_amount = excluded.commission_amount,
    last_paid_date = v_period_end,
    updated_at = now()
  WHERE public.referral_commissions.status = 'active';
  SELECT id INTO v_rc_id FROM public.referral_commissions WHERE subscription_id = p_subscription_id AND referrer_user_id = v_referrer_id;

  IF NOT (SELECT (status = 'active') FROM public.referral_commissions WHERE id = v_rc_id) THEN
    UPDATE public.subscriptions SET next_billing_date = v_period_end + interval '1 month', updated_at = now() WHERE id = p_subscription_id;
    RETURN jsonb_build_object('success', true, 'commissionPaid', false, 'reason', 'commission_stopped');
  END IF;

  UPDATE public.referral_commissions SET last_paid_date = v_period_end, updated_at = now() WHERE id = v_rc_id;

  v_gpc := LEAST(v_commission_cents, 2147483647)::integer;
  v_coin_ref := 'referral_comm_rc_' || v_rc_id::text || '_' || v_period_end::text;

  PERFORM public.credit_coins(v_referrer_id, 0, v_gpc);

  INSERT INTO public.coin_transactions (user_id, type, gold_coins, gpay_coins, description, reference)
  VALUES (
    v_referrer_id,
    'referral_commission',
    0,
    v_gpc,
    'Referral commission (recurring)',
    v_coin_ref
  );

  INSERT INTO public.transactions (user_id, type, amount, status, description, reference_id)
  VALUES (v_referrer_id, 'referral_commission', v_gpc, 'completed', 'Referral commission (recurring)', v_rc_id);

  UPDATE public.subscriptions SET next_billing_date = v_period_end + interval '1 month', updated_at = now() WHERE id = p_subscription_id;

  RETURN jsonb_build_object(
    'success', true,
    'commissionPaid', true,
    'commissionGpc', v_gpc,
    'commissionCents', v_gpc,
    'referrerId', v_referrer_id
  );
END;
$$;

COMMENT ON FUNCTION public.process_subscription_billing(uuid) IS
  'Pays recurring referral commission in GPay Coins (credit_coins). Amount equals legacy USD-cent integer (100 GPC = $1).';
