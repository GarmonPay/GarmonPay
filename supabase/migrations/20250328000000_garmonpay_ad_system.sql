-- GarmonPay Advertising & Revenue System
-- Slogan: Get Seen. Get Known. Get Paid.
-- Tables use garmon_ prefix where "ads" would conflict with existing public.ads (legacy reward ads).
-- All user_id FKs reference public.users(id).

-- Advertiser profiles
CREATE TABLE IF NOT EXISTS public.advertisers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  category TEXT,
  website TEXT,
  description TEXT,
  logo_url TEXT,
  is_verified BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  total_spent DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS advertisers_user_id ON public.advertisers(user_id);
CREATE INDEX IF NOT EXISTS advertisers_is_active ON public.advertisers(is_active);

-- Ad packages
CREATE TABLE IF NOT EXISTS public.ad_packages (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price_monthly DECIMAL(10,2) NOT NULL,
  ad_views INTEGER NOT NULL,
  features JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true
);

INSERT INTO public.ad_packages (id, name, price_monthly, ad_views, features, is_active) VALUES
  ('starter', 'Starter', 19.00, 1000, '["Basic profile","500 impressions","Email support"]'::jsonb, true),
  ('creator', 'Creator', 49.00, 3000, '["Featured profile","1500 impressions","Priority support","Analytics"]'::jsonb, true),
  ('pro', 'Pro', 99.00, 8000, '["Top placement","4000 impressions","24/7 support","Advanced analytics","Verified badge"]'::jsonb, true),
  ('business', 'Business', 199.00, 20000, '["Premium placement","10000 impressions","Dedicated manager","Full analytics","API access"]'::jsonb, true),
  ('enterprise', 'Enterprise', 499.00, 60000, '["#1 placement","30000 impressions","White glove service","Custom reporting","Direct integration"]'::jsonb, true)
ON CONFLICT (id) DO NOTHING;

-- Individual ads (advertiser-driven; legacy admin ads remain in public.ads)
CREATE TABLE IF NOT EXISTS public.garmon_ads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  advertiser_id UUID NOT NULL REFERENCES public.advertisers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  ad_type TEXT NOT NULL CHECK (ad_type IN ('video','banner','social','product')),
  media_url TEXT,
  thumbnail_url TEXT,
  destination_url TEXT,
  instagram_url TEXT,
  tiktok_url TEXT,
  youtube_url TEXT,
  twitter_url TEXT,
  facebook_url TEXT,
  twitch_url TEXT,
  total_budget DECIMAL(10,2) DEFAULT 0,
  remaining_budget DECIMAL(10,2) DEFAULT 0,
  cost_per_view DECIMAL(10,4) DEFAULT 0.008,
  cost_per_click DECIMAL(10,4) DEFAULT 0.025,
  cost_per_follow DECIMAL(10,4) DEFAULT 0.05,
  cost_per_share DECIMAL(10,4) DEFAULT 0.03,
  target_age_min INTEGER DEFAULT 18,
  target_age_max INTEGER DEFAULT 65,
  target_locations TEXT[],
  target_interests TEXT[],
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','active','paused','completed','rejected')),
  rejection_reason TEXT,
  views INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  follows INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  total_paid_to_users DECIMAL(10,2) DEFAULT 0,
  total_admin_cut DECIMAL(10,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT false,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS garmon_ads_advertiser_id ON public.garmon_ads(advertiser_id);
CREATE INDEX IF NOT EXISTS garmon_ads_user_id ON public.garmon_ads(user_id);
CREATE INDEX IF NOT EXISTS garmon_ads_status_active ON public.garmon_ads(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS garmon_ads_created_at ON public.garmon_ads(created_at DESC);

-- Ad engagements (every user interaction)
CREATE TABLE IF NOT EXISTS public.garmon_ad_engagements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ad_id UUID NOT NULL REFERENCES public.garmon_ads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  engagement_type TEXT NOT NULL CHECK (engagement_type IN ('view','click','follow','share','banner_view')),
  duration_seconds INTEGER DEFAULT 0,
  user_earned DECIMAL(10,6) DEFAULT 0,
  admin_earned DECIMAL(10,6) DEFAULT 0,
  advertiser_charged DECIMAL(10,6) DEFAULT 0,
  device_type TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS garmon_ad_engagements_ad_id ON public.garmon_ad_engagements(ad_id);
CREATE INDEX IF NOT EXISTS garmon_ad_engagements_user_id ON public.garmon_ad_engagements(user_id);
CREATE INDEX IF NOT EXISTS garmon_ad_engagements_created_at ON public.garmon_ad_engagements(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS garmon_ad_engagements_user_ad_day ON public.garmon_ad_engagements(ad_id, user_id, (created_at::date));

-- User earnings from ads (ledger for display; wallet credit via wallet_ledger)
CREATE TABLE IF NOT EXISTS public.garmon_user_ad_earnings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  ad_id UUID REFERENCES public.garmon_ads(id) ON DELETE SET NULL,
  engagement_id UUID REFERENCES public.garmon_ad_engagements(id) ON DELETE SET NULL,
  amount DECIMAL(10,6) NOT NULL,
  engagement_type TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','credited','withdrawn')),
  credited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS garmon_user_ad_earnings_user_id ON public.garmon_user_ad_earnings(user_id);
CREATE INDEX IF NOT EXISTS garmon_user_ad_earnings_created_at ON public.garmon_user_ad_earnings(created_at DESC);

-- Social platform connections for advertisers
CREATE TABLE IF NOT EXISTS public.garmon_advertiser_social_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  advertiser_id UUID NOT NULL REFERENCES public.advertisers(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('instagram','tiktok','youtube','twitter','facebook','twitch')),
  profile_url TEXT NOT NULL,
  handle TEXT,
  follower_count INTEGER,
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS garmon_advertiser_social_advertiser ON public.garmon_advertiser_social_links(advertiser_id);

-- Ad fraud prevention
CREATE TABLE IF NOT EXISTS public.garmon_ad_fraud_flags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ad_id UUID REFERENCES public.garmon_ads(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS garmon_ad_fraud_flags_user ON public.garmon_ad_fraud_flags(user_id);

-- Blocked keywords for content moderation (store in config table)
CREATE TABLE IF NOT EXISTS public.garmon_ad_blocked_keywords (
  id SERIAL PRIMARY KEY,
  keyword TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.garmon_ad_blocked_keywords (keyword) VALUES
  ('adult'),('sexual'),('nude'),('gambling'),('drugs'),('weapons'),('scam'),('fraud'),('hack'),
  ('porn'),('xxx'),('nsfw'),('illegal'),('counterfeit'),('phishing')
ON CONFLICT (keyword) DO NOTHING;

-- RLS
ALTER TABLE public.advertisers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.garmon_ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.garmon_ad_engagements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.garmon_user_ad_earnings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own advertiser profile" ON public.advertisers;
CREATE POLICY "Users manage own advertiser profile"
  ON public.advertisers FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Anyone can view active garmon ads" ON public.garmon_ads;
CREATE POLICY "Anyone can view active garmon ads"
  ON public.garmon_ads FOR SELECT USING (status = 'active' AND is_active = true);

DROP POLICY IF EXISTS "Advertisers manage own garmon ads" ON public.garmon_ads;
CREATE POLICY "Advertisers manage own garmon ads"
  ON public.garmon_ads FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full garmon ads" ON public.garmon_ads;
CREATE POLICY "Service role full garmon ads"
  ON public.garmon_ads FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "Users view own garmon ad earnings" ON public.garmon_user_ad_earnings;
CREATE POLICY "Users view own garmon ad earnings"
  ON public.garmon_user_ad_earnings FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full garmon ad earnings" ON public.garmon_user_ad_earnings;
CREATE POLICY "Service role full garmon ad earnings"
  ON public.garmon_user_ad_earnings FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Service role for engagements (only backend inserts)
ALTER TABLE public.garmon_ad_engagements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full garmon engagements" ON public.garmon_ad_engagements;
CREATE POLICY "Service role full garmon engagements"
  ON public.garmon_ad_engagements FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "Users read own garmon engagements" ON public.garmon_ad_engagements;
CREATE POLICY "Users read own garmon engagements"
  ON public.garmon_ad_engagements FOR SELECT USING (auth.uid() = user_id);

-- Advertisers: allow service role for admin
DROP POLICY IF EXISTS "Service role advertisers" ON public.advertisers;
CREATE POLICY "Service role advertisers"
  ON public.advertisers FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
