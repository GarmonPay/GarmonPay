-- public.ad_packages columns (GarmonPay — do not use price_cents / views_delivered; those are not in this table).
-- id TEXT PK, name TEXT, price_monthly NUMERIC (dollars e.g. 19.99), ad_views INT, included_clicks INT,
-- sort_order INT, features JSONB, is_active BOOL
--
-- Idempotent upsert for Basic Reach (same economics as migration 20260324130500):

INSERT INTO public.ad_packages (
  id, name, price_monthly, ad_views, included_clicks, sort_order, features, is_active
) VALUES (
  'basic_reach',
  'Basic Reach',
  19.99,
  500,
  50,
  10,
  '{"bullets":["500 verified views + 50 click credits","Member payout pool up to $7.50","Est. ad budget use up to $15.00 if fully delivered","Platform margin ~$4.99 after delivery"],"member_payout_usd":7.5,"member_payout_views_usd":5,"member_payout_clicks_usd":2.5,"advertiser_burn_ceiling_usd":15,"platform_profit_usd":4.99,"cpv_to_advertiser":0.03998,"cpc_pool_usd":2.5,"est_reach":"500 views · 50 clicks"}'::jsonb,
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
