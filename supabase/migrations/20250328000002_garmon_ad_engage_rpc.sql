-- Atomic ad engagement: validate limits, deduct budget, record engagement & earning, credit user wallet.
-- All amounts in garmon_* tables are dollars; wallet_ledger uses cents.

CREATE OR REPLACE FUNCTION public.garmon_ad_engage(
  p_user_id uuid,
  p_ad_id uuid,
  p_engagement_type text,
  p_duration_seconds int DEFAULT 0,
  p_user_earned_dollars decimal DEFAULT 0,
  p_admin_earned_dollars decimal DEFAULT 0,
  p_advertiser_charged_dollars decimal DEFAULT 0,
  p_ip_address text DEFAULT NULL,
  p_device_type text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ad record;
  v_same_ad_24h int;
  v_same_advertiser_today int;
  v_user_earned_today decimal;
  v_engagement_id uuid;
  v_earning_id uuid;
  v_cents bigint;
  v_ledger_result jsonb;
BEGIN
  -- 1) Load ad
  SELECT * INTO v_ad FROM public.garmon_ads WHERE id = p_ad_id FOR UPDATE;
  IF v_ad IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Ad not found');
  END IF;
  IF v_ad.status != 'active' OR v_ad.is_active IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'message', 'Ad is not active');
  END IF;
  IF v_ad.remaining_budget < p_advertiser_charged_dollars THEN
    RETURN jsonb_build_object('success', false, 'message', 'Insufficient ad budget');
  END IF;

  -- 2) Same ad: max 1 per 24h
  SELECT count(*) INTO v_same_ad_24h
  FROM public.garmon_ad_engagements
  WHERE ad_id = p_ad_id AND user_id = p_user_id
    AND created_at >= now() - interval '24 hours';
  IF v_same_ad_24h > 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Already engaged with this ad in the last 24 hours');
  END IF;

  -- 3) Same advertiser: max 3 per day
  SELECT count(*) INTO v_same_advertiser_today
  FROM public.garmon_ad_engagements e
  JOIN public.garmon_ads a ON a.id = e.ad_id
  WHERE e.user_id = p_user_id AND a.advertiser_id = v_ad.advertiser_id
    AND e.created_at >= date_trunc('day', now());
  IF v_same_advertiser_today >= 3 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Max 3 engagements per advertiser per day');
  END IF;

  -- 4) User daily cap $2
  SELECT coalesce(sum(amount), 0) INTO v_user_earned_today
  FROM public.garmon_user_ad_earnings
  WHERE user_id = p_user_id AND status = 'credited'
    AND credited_at >= date_trunc('day', now());
  IF v_user_earned_today + p_user_earned_dollars > 2.0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Daily earnings limit reached');
  END IF;

  -- 5) Fraud flag check
  IF EXISTS (SELECT 1 FROM public.garmon_ad_fraud_flags WHERE user_id = p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Account flagged');
  END IF;

  -- 6) Insert engagement
  INSERT INTO public.garmon_ad_engagements (
    ad_id, user_id, engagement_type, duration_seconds,
    user_earned, admin_earned, advertiser_charged, ip_address, device_type
  ) VALUES (
    p_ad_id, p_user_id, p_engagement_type, p_duration_seconds,
    p_user_earned_dollars, p_admin_earned_dollars, p_advertiser_charged_dollars,
    p_ip_address, p_device_type
  )
  RETURNING id INTO v_engagement_id;

  -- 7) Insert user_ad_earning (credited)
  INSERT INTO public.garmon_user_ad_earnings (
    user_id, ad_id, engagement_id, amount, engagement_type, status, credited_at
  ) VALUES (
    p_user_id, p_ad_id, v_engagement_id, p_user_earned_dollars, p_engagement_type,
    'credited', now()
  )
  RETURNING id INTO v_earning_id;

  -- 8) Update ad: budget, stats, total_paid, total_admin_cut
  UPDATE public.garmon_ads SET
    remaining_budget = remaining_budget - p_advertiser_charged_dollars,
    total_paid_to_users = total_paid_to_users + p_user_earned_dollars,
    total_admin_cut = total_admin_cut + p_admin_earned_dollars,
    views = views + CASE WHEN p_engagement_type IN ('view','banner_view') THEN 1 ELSE 0 END,
    clicks = clicks + CASE WHEN p_engagement_type = 'click' THEN 1 ELSE 0 END,
    follows = follows + CASE WHEN p_engagement_type = 'follow' THEN 1 ELSE 0 END,
    shares = shares + CASE WHEN p_engagement_type = 'share' THEN 1 ELSE 0 END,
    status = CASE WHEN remaining_budget - p_advertiser_charged_dollars <= 0 THEN 'paused' ELSE status END,
    is_active = CASE WHEN remaining_budget - p_advertiser_charged_dollars <= 0 THEN false ELSE is_active END,
    updated_at = now()
  WHERE id = p_ad_id;

  -- 9) Credit user wallet (cents)
  v_cents := round(p_user_earned_dollars * 100)::bigint;
  IF v_cents > 0 THEN
    v_ledger_result := public.wallet_ledger_entry(
      p_user_id,
      'ad_earning',
      v_cents,
      'garmon_engage_' || v_engagement_id::text
    );
    IF (v_ledger_result->>'success')::boolean IS NOT TRUE THEN
      -- Rollback by raising; in production you might want to compensate
      RAISE EXCEPTION 'Wallet credit failed: %', v_ledger_result->>'message';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'engagementId', v_engagement_id,
    'earningId', v_earning_id,
    'userEarnedDollars', p_user_earned_dollars,
    'userEarnedCents', v_cents
  );
END;
$$;
