-- Blocked IPs (prefix or full) and users banned from ad earnings.
CREATE TABLE IF NOT EXISTS public.garmon_blocked_ips (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ip_prefix TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS garmon_blocked_ips_prefix ON public.garmon_blocked_ips(ip_prefix);
CREATE INDEX IF NOT EXISTS garmon_blocked_ips_created ON public.garmon_blocked_ips(created_at DESC);

CREATE TABLE IF NOT EXISTS public.garmon_ad_banned_users (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE PRIMARY KEY,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.garmon_blocked_ips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.garmon_ad_banned_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role garmon_blocked_ips" ON public.garmon_blocked_ips;
CREATE POLICY "Service role garmon_blocked_ips"
  ON public.garmon_blocked_ips FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "Service role garmon_ad_banned_users" ON public.garmon_ad_banned_users;
CREATE POLICY "Service role garmon_ad_banned_users"
  ON public.garmon_ad_banned_users FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
