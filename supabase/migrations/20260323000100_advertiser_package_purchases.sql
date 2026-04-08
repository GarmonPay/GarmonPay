-- Tracks ad package purchases made via Stripe checkout from /advertise.
CREATE TABLE IF NOT EXISTS public.advertiser_package_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  advertiser_id UUID NOT NULL REFERENCES public.advertisers(id) ON DELETE CASCADE,
  package_id TEXT NOT NULL REFERENCES public.ad_packages(id) ON DELETE RESTRICT,
  campaign_id UUID REFERENCES public.garmon_ads(id) ON DELETE SET NULL,
  package_name TEXT NOT NULL,
  stripe_session_id TEXT NOT NULL UNIQUE,
  amount_paid DECIMAL(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'paid',
  ad_views INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS advertiser_package_purchases_user_id_idx
  ON public.advertiser_package_purchases(user_id);

CREATE INDEX IF NOT EXISTS advertiser_package_purchases_advertiser_id_idx
  ON public.advertiser_package_purchases(advertiser_id);

CREATE INDEX IF NOT EXISTS advertiser_package_purchases_package_id_idx
  ON public.advertiser_package_purchases(package_id);

CREATE INDEX IF NOT EXISTS advertiser_package_purchases_campaign_id_idx
  ON public.advertiser_package_purchases(campaign_id);

ALTER TABLE public.advertiser_package_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own package purchases" ON public.advertiser_package_purchases;
CREATE POLICY "Users view own package purchases"
  ON public.advertiser_package_purchases
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages package purchases" ON public.advertiser_package_purchases;
CREATE POLICY "Service role manages package purchases"
  ON public.advertiser_package_purchases
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');
