-- C-Lo room pause: banker pause + player majority votes (max 5 minutes).

ALTER TABLE public.celo_rooms
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS paused_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pause_reason text,
  ADD COLUMN IF NOT EXISTS pause_expires_at timestamptz;

COMMENT ON COLUMN public.celo_rooms.paused_at IS 'When the room was paused; cleared on resume.';
COMMENT ON COLUMN public.celo_rooms.paused_by IS 'User who last initiated pause (banker or player whose vote completed majority).';
COMMENT ON COLUMN public.celo_rooms.pause_expires_at IS 'Auto-close deadline if not resumed.';

CREATE TABLE IF NOT EXISTS public.celo_pause_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.celo_rooms (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  vote text NOT NULL CHECK (vote IN ('request', 'approve')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, user_id, vote)
);

CREATE INDEX IF NOT EXISTS celo_pause_votes_room_id_idx
  ON public.celo_pause_votes (room_id);

ALTER TABLE public.celo_pause_votes ENABLE ROW LEVEL SECURITY;

-- Server/API uses service role; no direct client writes.
CREATE POLICY "Service role full access celo_pause_votes"
  ON public.celo_pause_votes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
