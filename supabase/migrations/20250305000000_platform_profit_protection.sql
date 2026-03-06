-- Platform profit protection: game_config (house edge), platform_settings (ad reward %), platform_balance (payout protection).
-- Rule: total_rewards_paid <= total_revenue_generated; never pay out more than available platform balance.

-- ========== ENSURE public.ads HAS COLUMNS USED BY complete_ad_session_with_platform_protection ==========
-- (ads may have been created by 20250234 with different schema; 20250218 create is skipped so advertiser_price/duration_seconds missing)
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS advertiser_price bigint NOT NULL DEFAULT 0;
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS duration_seconds int NOT NULL DEFAULT 5;

-- ========== GAME_CONFIG: per-game house edge (percent) ==========
CREATE TABLE IF NOT EXISTS public.game_config (
  game_name text PRIMARY KEY CHECK (game_name IN ('spin_wheel', 'scratch_card', 'pinball', 'mystery_box', 'boxing')),
  house_edge_percent numeric(5,2) NOT NULL DEFAULT 10 CHECK (house_edge_percent >= 0 AND house_edge_percent <= 100),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.game_config (game_name, house_edge_percent)
VALUES
  ('spin_wheel', 10),
  ('scratch_card', 12),
  ('pinball', 10),
  ('mystery_box', 15),
  ('boxing', 10)
ON CONFLICT (game_name) DO NOTHING;

ALTER TABLE public.game_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access game_config" ON public.game_config;
CREATE POLICY "Service role full access game_config"
  ON public.game_config FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.game_config IS 'Admin-configurable house edge per game (percent). Platform keeps this edge.';

-- ========== PLATFORM_SETTINGS: global settings (ad reward %, etc.) ==========
CREATE TABLE IF NOT EXISTS public.platform_settings (
  id text PRIMARY KEY DEFAULT 'default',
  ad_reward_percent numeric(5,2) NOT NULL DEFAULT 40 CHECK (ad_reward_percent >= 0 AND ad_reward_percent <= 100),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.platform_settings (id, ad_reward_percent)
VALUES ('default', 40)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access platform_settings" ON public.platform_settings;
CREATE POLICY "Service role full access platform_settings"
  ON public.platform_settings FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.platform_settings IS 'Global platform settings. ad_reward_percent: users get this % of ad revenue (default 40), platform keeps the rest.';

-- ========== PLATFORM_BALANCE: single-row running balance for payout protection ==========
CREATE TABLE IF NOT EXISTS public.platform_balance (
  id text PRIMARY KEY DEFAULT 'default',
  balance_cents bigint NOT NULL DEFAULT 0,
  total_revenue_cents bigint NOT NULL DEFAULT 0,
  total_rewards_paid_cents bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.platform_balance (id, balance_cents, total_revenue_cents, total_rewards_paid_cents)
VALUES ('default', 0, 0, 0)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.platform_balance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access platform_balance" ON public.platform_balance;
CREATE POLICY "Service role full access platform_balance"
  ON public.platform_balance FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.platform_balance IS 'Running platform balance. Enforce: total_rewards_paid_cents <= total_revenue_cents; never pay if balance_cents < payout.';

-- Optional: trigger to enforce total_rewards_paid <= total_revenue (safety net)
CREATE OR REPLACE FUNCTION public.check_platform_balance_integrity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.total_rewards_paid_cents > NEW.total_revenue_cents THEN
    RAISE EXCEPTION 'Platform integrity: total_rewards_paid (%) cannot exceed total_revenue (%)',
      NEW.total_rewards_paid_cents, NEW.total_revenue_cents;
  END IF;
  IF NEW.balance_cents < 0 THEN
    RAISE EXCEPTION 'Platform balance cannot be negative';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS platform_balance_integrity ON public.platform_balance;
CREATE TRIGGER platform_balance_integrity
  BEFORE UPDATE ON public.platform_balance
  FOR EACH ROW EXECUTE PROCEDURE public.check_platform_balance_integrity();

-- RPCs for platform_balance updates (service role only; call from API)
CREATE OR REPLACE FUNCTION public.platform_record_revenue(p_amount_cents bigint, p_source text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.platform_balance
  SET
    balance_cents = balance_cents + p_amount_cents,
    total_revenue_cents = total_revenue_cents + p_amount_cents,
    updated_at = now()
  WHERE id = 'default';
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_record_payout(p_amount_cents bigint, p_source text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_balance bigint;
  v_rewards bigint;
  v_revenue bigint;
BEGIN
  SELECT balance_cents, total_rewards_paid_cents, total_revenue_cents
  INTO v_balance, v_rewards, v_revenue
  FROM public.platform_balance WHERE id = 'default';
  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'platform_balance row not found';
  END IF;
  IF v_balance < p_amount_cents THEN
    RAISE EXCEPTION 'Insufficient platform balance';
  END IF;
  IF v_rewards + p_amount_cents > v_revenue THEN
    RAISE EXCEPTION 'Payout would exceed total revenue';
  END IF;
  UPDATE public.platform_balance
  SET
    balance_cents = balance_cents - p_amount_cents,
    total_rewards_paid_cents = total_rewards_paid_cents + p_amount_cents,
    updated_at = now()
  WHERE id = 'default';
END;
$$;

-- Ad completion with platform protection: uses platform_settings.ad_reward_percent (40% default), updates platform_balance.
CREATE OR REPLACE FUNCTION public.complete_ad_session_with_platform_protection(p_user_id uuid, p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_session record;
  v_ad record;
  v_pct numeric;
  v_reward bigint;
  v_revenue bigint;
BEGIN
  SELECT * INTO v_session FROM public.ad_sessions WHERE id = p_session_id FOR UPDATE;
  IF v_session IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Invalid session'); END IF;
  IF v_session.user_id != p_user_id THEN RETURN jsonb_build_object('success', false, 'message', 'Unauthorized'); END IF;
  IF v_session.reward_given THEN RETURN jsonb_build_object('success', false, 'message', 'Reward already issued'); END IF;
  IF (v_session.start_time + (SELECT duration_seconds FROM public.ads WHERE id = v_session.ad_id) * interval '1 second') > now() THEN
    RETURN jsonb_build_object('success', false, 'message', 'Timer not complete');
  END IF;

  SELECT * INTO v_ad FROM public.ads WHERE id = v_session.ad_id;
  IF v_ad IS NULL THEN RETURN jsonb_build_object('success', false, 'message', 'Ad not found'); END IF;

  SELECT COALESCE((SELECT ad_reward_percent FROM public.platform_settings WHERE id = 'default' LIMIT 1), 40) INTO v_pct;
  v_reward := round(v_ad.advertiser_price * v_pct / 100)::bigint;
  v_revenue := v_ad.advertiser_price;

  PERFORM public.platform_record_revenue(v_revenue, 'ad');
  PERFORM public.platform_record_payout(v_reward, 'ad');

  UPDATE public.ad_sessions SET completed = true, reward_given = true WHERE id = p_session_id;
  UPDATE public.users SET balance = balance + v_reward, updated_at = now() WHERE id = p_user_id;
  INSERT INTO public.earnings (user_id, amount, source, reference_id) VALUES (p_user_id, v_reward, 'ad', p_session_id);
  INSERT INTO public.transactions (user_id, type, amount, status, description, reference_id)
  VALUES (p_user_id, 'earning', v_reward, 'completed', 'Ad reward', p_session_id);

  RETURN jsonb_build_object('success', true, 'rewardCents', v_reward);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;
