-- Notifications for GarmonPay (ads, earnings, etc.)
CREATE TABLE IF NOT EXISTS public.garmon_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS garmon_notifications_user_id ON public.garmon_notifications(user_id);
CREATE INDEX IF NOT EXISTS garmon_notifications_created_at ON public.garmon_notifications(created_at DESC);

ALTER TABLE public.garmon_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own garmon notifications" ON public.garmon_notifications;
CREATE POLICY "Users read own garmon notifications"
  ON public.garmon_notifications FOR ALL USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role garmon notifications" ON public.garmon_notifications;
CREATE POLICY "Service role garmon notifications"
  ON public.garmon_notifications FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Ad streak: last activity date and consecutive days
CREATE TABLE IF NOT EXISTS public.garmon_ad_streak (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE PRIMARY KEY,
  last_activity_date DATE NOT NULL,
  streak_days INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.garmon_ad_streak ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own streak" ON public.garmon_ad_streak;
CREATE POLICY "Users read own streak"
  ON public.garmon_ad_streak FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role garmon streak" ON public.garmon_ad_streak;
CREATE POLICY "Service role garmon streak"
  ON public.garmon_ad_streak FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
