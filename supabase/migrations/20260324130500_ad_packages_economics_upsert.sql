-- Idempotent fix: align allotments with engage economics (advertiser pays 2× member pool at cap).
-- Safe if 20260324120000 was already applied with older (incorrect) row counts.

INSERT INTO public.ad_packages (
  id, name, price_monthly, ad_views, included_clicks, sort_order, features, is_active
) VALUES
(
  'basic_reach',
  'Basic Reach',
  19.99,
  500,
  50,
  10,
  '{"bullets":["500 verified views + 50 click credits","Member payout pool up to $7.50","Est. ad budget use up to $15.00 if fully delivered","Platform margin ~$4.99 after delivery"],"member_payout_usd":7.5,"member_payout_views_usd":5,"member_payout_clicks_usd":2.5,"advertiser_burn_ceiling_usd":15,"platform_profit_usd":4.99,"cpv_to_advertiser":0.03998,"cpc_pool_usd":2.5,"est_reach":"500 views · 50 clicks"}'::jsonb,
  true
),
(
  'standard_reach',
  'Standard Reach',
  49.99,
  1500,
  150,
  20,
  '{"bullets":["1,500 verified views + 150 click credits","Member payout pool up to $22.50","Est. ad budget use up to $45.00 if fully delivered","Platform margin ~$4.99 after delivery"],"member_payout_usd":22.5,"member_payout_views_usd":15,"member_payout_clicks_usd":7.5,"advertiser_burn_ceiling_usd":45,"platform_profit_usd":4.99,"cpv_to_advertiser":0.03333,"cpc_pool_usd":7.5,"est_reach":"1,500 views · 150 clicks"}'::jsonb,
  true
),
(
  'growth_reach',
  'Growth Reach',
  99.99,
  3000,
  300,
  30,
  '{"bullets":["3,000 verified views + 300 click credits","Member payout pool up to $45.00","Est. ad budget use up to $90.00 if fully delivered","Platform margin ~$9.99 after delivery"],"member_payout_usd":45,"member_payout_views_usd":30,"member_payout_clicks_usd":15,"advertiser_burn_ceiling_usd":90,"platform_profit_usd":9.99,"cpv_to_advertiser":0.03333,"cpc_pool_usd":15,"est_reach":"3,000 views · 300 clicks"}'::jsonb,
  true
),
(
  'pro_reach',
  'Pro Reach',
  199.99,
  6000,
  600,
  40,
  '{"bullets":["6,000 verified views + 600 click credits","Member payout pool up to $90.00","Est. ad budget use up to $180.00 if fully delivered","Platform margin ~$19.99 after delivery"],"member_payout_usd":90,"member_payout_views_usd":60,"member_payout_clicks_usd":30,"advertiser_burn_ceiling_usd":180,"platform_profit_usd":19.99,"cpv_to_advertiser":0.03333,"cpc_pool_usd":30,"est_reach":"6,000 views · 600 clicks"}'::jsonb,
  true
),
(
  'elite_reach',
  'Elite Reach',
  399.99,
  12000,
  1200,
  50,
  '{"bullets":["12,000 verified views + 1,200 click credits","Member payout pool up to $180.00","Est. ad budget use up to $360.00 if fully delivered","Platform margin ~$39.99 after delivery"],"member_payout_usd":180,"member_payout_views_usd":120,"member_payout_clicks_usd":60,"advertiser_burn_ceiling_usd":360,"platform_profit_usd":39.99,"cpv_to_advertiser":0.03333,"cpc_pool_usd":60,"est_reach":"12,000 views · 1,200 clicks"}'::jsonb,
  true
),
(
  'premium_brand',
  'Premium Brand',
  799.99,
  26000,
  2600,
  60,
  '{"bullets":["26,000 verified views + 2,600 click credits","Member payout pool up to $390.00","Est. ad budget use up to $780.00 if fully delivered","Platform margin ~$19.99 after delivery"],"member_payout_usd":390,"member_payout_views_usd":260,"member_payout_clicks_usd":130,"advertiser_burn_ceiling_usd":780,"platform_profit_usd":19.99,"cpv_to_advertiser":0.03077,"cpc_pool_usd":130,"est_reach":"26,000 views · 2,600 clicks"}'::jsonb,
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  price_monthly = EXCLUDED.price_monthly,
  ad_views = EXCLUDED.ad_views,
  included_clicks = EXCLUDED.included_clicks,
  sort_order = EXCLUDED.sort_order,
  features = EXCLUDED.features,
  is_active = EXCLUDED.is_active;
