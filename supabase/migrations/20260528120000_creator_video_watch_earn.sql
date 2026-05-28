-- Watch-only earn: creator videos, server-timed sessions, GPC completions.

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS watch_payout_gpc integer NOT NULL DEFAULT 10;

COMMENT ON COLUMN public.platform_settings.watch_payout_gpc IS
  'GPC awarded per completed 30-second video watch (member earn).';

CREATE TABLE IF NOT EXISTS public.creator_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  title text NOT NULL,
  video_url text NOT NULL,
  thumbnail_url text,
  target_demo jsonb,
  budget_gpc integer NOT NULL CHECK (budget_gpc > 0),
  spent_gpc integer NOT NULL DEFAULT 0 CHECK (spent_gpc >= 0),
  views_count integer NOT NULL DEFAULT 0 CHECK (views_count >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'approved', 'rejected', 'flagged', 'paused', 'depleted')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  approved_by uuid REFERENCES public.users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS creator_videos_creator_id_idx ON public.creator_videos (creator_id);
CREATE INDEX IF NOT EXISTS creator_videos_status_idx ON public.creator_videos (status);
CREATE INDEX IF NOT EXISTS creator_videos_created_at_idx ON public.creator_videos (created_at DESC);

CREATE TABLE IF NOT EXISTS public.video_watch_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES public.creator_videos (id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  valid boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS video_watch_sessions_user_idx ON public.video_watch_sessions (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS video_watch_sessions_video_idx ON public.video_watch_sessions (video_id);

CREATE TABLE IF NOT EXISTS public.video_watch_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL REFERENCES public.creator_videos (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  watch_session_id uuid NOT NULL REFERENCES public.video_watch_sessions (id) ON DELETE CASCADE,
  gpc_awarded integer NOT NULL CHECK (gpc_awarded > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, video_id)
);

CREATE INDEX IF NOT EXISTS video_watch_completions_user_created_idx
  ON public.video_watch_completions (user_id, created_at DESC);

ALTER TABLE public.creator_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_watch_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_watch_completions ENABLE ROW LEVEL SECURITY;

-- creator_videos: creators manage own rows
DROP POLICY IF EXISTS creator_videos_select_own ON public.creator_videos;
CREATE POLICY creator_videos_select_own
  ON public.creator_videos FOR SELECT TO authenticated
  USING (auth.uid() = creator_id);

DROP POLICY IF EXISTS creator_videos_insert_own ON public.creator_videos;
CREATE POLICY creator_videos_insert_own
  ON public.creator_videos FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS creator_videos_update_own ON public.creator_videos;
CREATE POLICY creator_videos_update_own
  ON public.creator_videos FOR UPDATE TO authenticated
  USING (auth.uid() = creator_id)
  WITH CHECK (auth.uid() = creator_id);

-- Public feed: approved videos only
DROP POLICY IF EXISTS creator_videos_select_approved ON public.creator_videos;
CREATE POLICY creator_videos_select_approved
  ON public.creator_videos FOR SELECT TO authenticated
  USING (status = 'approved');

-- Admin full access on creator_videos
DROP POLICY IF EXISTS creator_videos_admin_all ON public.creator_videos;
CREATE POLICY creator_videos_admin_all
  ON public.creator_videos FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND lower(COALESCE(u.role, '')) IN ('admin', 'game_admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND lower(COALESCE(u.role, '')) IN ('admin', 'game_admin', 'super_admin')
    )
  );

-- video_watch_sessions: users see/insert own
DROP POLICY IF EXISTS video_watch_sessions_own ON public.video_watch_sessions;
CREATE POLICY video_watch_sessions_own
  ON public.video_watch_sessions FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS video_watch_sessions_admin ON public.video_watch_sessions;
CREATE POLICY video_watch_sessions_admin
  ON public.video_watch_sessions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND lower(COALESCE(u.role, '')) IN ('admin', 'game_admin', 'super_admin')
    )
  );

-- video_watch_completions: users see own; admin see all
DROP POLICY IF EXISTS video_watch_completions_select_own ON public.video_watch_completions;
CREATE POLICY video_watch_completions_select_own
  ON public.video_watch_completions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS video_watch_completions_admin ON public.video_watch_completions;
CREATE POLICY video_watch_completions_admin
  ON public.video_watch_completions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND lower(COALESCE(u.role, '')) IN ('admin', 'game_admin', 'super_admin')
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.creator_videos TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.video_watch_sessions TO authenticated;
GRANT SELECT ON public.video_watch_completions TO authenticated;
