-- Server-side engagement sessions for anti-fraud duration validation.
-- Depends on: 20250328000000_garmonpay_ad_system.sql (public.garmon_ads must exist).
CREATE TABLE IF NOT EXISTS public.garmon_engagement_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  ad_id UUID NOT NULL REFERENCES public.garmon_ads(id) ON DELETE CASCADE,
  engagement_type TEXT NOT NULL CHECK (engagement_type IN ('view','click','follow','share','banner_view')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes'),
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS garmon_engagement_sessions_user ON public.garmon_engagement_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS garmon_engagement_sessions_ad ON public.garmon_engagement_sessions(ad_id);

ALTER TABLE public.garmon_engagement_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own engagement sessions" ON public.garmon_engagement_sessions;
CREATE POLICY "Users own engagement sessions"
  ON public.garmon_engagement_sessions FOR ALL USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role engagement sessions" ON public.garmon_engagement_sessions;
CREATE POLICY "Service role engagement sessions"
  ON public.garmon_engagement_sessions FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
