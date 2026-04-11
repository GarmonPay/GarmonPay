-- Optional attribution for platform fee lines (e.g. C-Lo player win fee)
ALTER TABLE public.platform_earnings
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS platform_earnings_user_created ON public.platform_earnings (user_id, created_at DESC);
