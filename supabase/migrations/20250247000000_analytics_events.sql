-- Analytics events for mobile and web (login, ad_view, reward_earned, withdrawal_requested).
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  payload jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analytics_events_user_id ON public.analytics_events (user_id);
CREATE INDEX IF NOT EXISTS analytics_events_event_type ON public.analytics_events (event_type);
CREATE INDEX IF NOT EXISTS analytics_events_created_at ON public.analytics_events (created_at DESC);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access analytics_events" ON public.analytics_events;
CREATE POLICY "Service role full access analytics_events"
  ON public.analytics_events FOR ALL
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.analytics_events IS 'Event tracking: login, ad_view, reward_earned, withdrawal_requested';
