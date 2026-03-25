-- Canonical membership marketing data + clean ad_packages (advertiser SKUs).
-- Run in Supabase SQL editor if this migration was not applied via CLI.

-- ========== Membership plan catalog (public read for pricing page / API) ==========
CREATE TABLE IF NOT EXISTS public.membership_plan_catalog (
  id text PRIMARY KEY,
  display_order integer NOT NULL DEFAULT 0,
  name text NOT NULL,
  price_monthly_usd numeric(10, 2) NOT NULL DEFAULT 0,
  ad_rate_per_ad numeric(12, 4) NOT NULL,
  referral_commission_pct numeric(5, 2) NOT NULL,
  min_withdrawal_usd numeric(10, 2) NOT NULL,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.membership_plan_catalog ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read membership_plan_catalog" ON public.membership_plan_catalog;
CREATE POLICY "Anyone can read membership_plan_catalog"
  ON public.membership_plan_catalog FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "Service role full membership_plan_catalog" ON public.membership_plan_catalog;
CREATE POLICY "Service role full membership_plan_catalog"
  ON public.membership_plan_catalog FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

INSERT INTO public.membership_plan_catalog (id, display_order, name, price_monthly_usd, ad_rate_per_ad, referral_commission_pct, min_withdrawal_usd, features, is_active)
VALUES
  ('free', 0, 'Free', 0, 0.01, 10, 20,
   '["Ad rate $0.01 per ad","10% referral commission on all referral earnings forever","$20 minimum withdrawal","Basic tasks only"]'::jsonb, true),
  ('starter', 1, 'Starter', 9.99, 0.03, 20, 10,
   '["Ad rate $0.03 per ad","20% referral commission","$10 minimum withdrawal","5 extra daily tasks"]'::jsonb, true),
  ('growth', 2, 'Growth', 24.99, 0.05, 30, 5,
   '["Ad rate $0.05 per ad","30% referral commission","$5 minimum withdrawal","Games and tasks access","$10 monthly advertising credit"]'::jsonb, true),
  ('pro', 3, 'Pro', 49.99, 0.08, 40, 2,
   '["Ad rate $0.08 per ad","40% referral commission","$2 minimum withdrawal","Priority tasks","$25 monthly advertising credit"]'::jsonb, true),
  ('elite', 4, 'Elite', 99.99, 0.15, 50, 1,
   '["Ad rate $0.15 per ad","50% referral commission (maximum)","$1 minimum withdrawal","All access to every feature","$50 monthly advertising credit"]'::jsonb, true)
ON CONFLICT (id) DO UPDATE SET
  display_order = excluded.display_order,
  name = excluded.name,
  price_monthly_usd = excluded.price_monthly_usd,
  ad_rate_per_ad = excluded.ad_rate_per_ad,
  referral_commission_pct = excluded.referral_commission_pct,
  min_withdrawal_usd = excluded.min_withdrawal_usd,
  features = excluded.features,
  is_active = excluded.is_active,
  updated_at = now();

-- Align referral_commission_config with marketing tiers (existing DB tiers only).
UPDATE public.referral_commission_config SET commission_percentage = 20, updated_at = now() WHERE membership_tier = 'starter';
UPDATE public.referral_commission_config SET commission_percentage = 40, updated_at = now() WHERE membership_tier = 'pro';
UPDATE public.referral_commission_config SET commission_percentage = 50, updated_at = now() WHERE membership_tier = 'elite';
UPDATE public.referral_commission_config SET commission_percentage = 50, updated_at = now() WHERE membership_tier = 'vip';

-- ========== Advertiser packages: single clean set (removes duplicates / old SKUs) ==========
DELETE FROM public.ad_packages;

INSERT INTO public.ad_packages (id, name, price_monthly, ad_views, features, is_active) VALUES
  ('basic_reach', 'Basic Reach', 19.99, 500,
   '{"bullets":["500 ad views delivered","Member payout pool $5.00 ($0.01 × 500)","Platform profit ~$14.99"],"member_payout_usd":5,"platform_profit_usd":14.99,"cpv_to_advertiser":0.03998,"est_reach":"500 verified views"}'::jsonb,
   true),
  ('standard_reach', 'Standard Reach', 49.99, 1500,
   '{"bullets":["1,500 ad views delivered","Member payout pool $15.00","Platform profit ~$34.99"],"member_payout_usd":15,"platform_profit_usd":34.99,"cpv_to_advertiser":0.03333,"est_reach":"1,500 verified views"}'::jsonb,
   true),
  ('growth_reach', 'Growth Reach', 99.99, 3500,
   '{"bullets":["3,500 ad views delivered","Member payout pool $35.00","Platform profit ~$64.99"],"member_payout_usd":35,"platform_profit_usd":64.99,"cpv_to_advertiser":0.02857,"est_reach":"3,500 verified views"}'::jsonb,
   true),
  ('pro_reach', 'Pro Reach', 199.99, 8000,
   '{"bullets":["8,000 ad views delivered","Member payout pool $80.00","Platform profit ~$119.99"],"member_payout_usd":80,"platform_profit_usd":119.99,"cpv_to_advertiser":0.025,"est_reach":"8,000 verified views"}'::jsonb,
   true),
  ('elite_reach', 'Elite Reach', 399.99, 18000,
   '{"bullets":["18,000 ad views delivered","Member payout pool $180.00","Platform profit ~$219.99"],"member_payout_usd":180,"platform_profit_usd":219.99,"cpv_to_advertiser":0.02222,"est_reach":"18,000 verified views"}'::jsonb,
   true),
  ('premium_brand', 'Premium Brand', 799.99, 40000,
   '{"bullets":["40,000 ad views delivered","Member payout pool $400.00","Platform profit ~$399.99"],"member_payout_usd":400,"platform_profit_usd":399.99,"cpv_to_advertiser":0.02,"est_reach":"40,000 verified views"}'::jsonb,
   true);
