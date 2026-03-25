-- Email waitlist for Game Station (public API inserts via service role).

CREATE TABLE IF NOT EXISTS public.game_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS game_waitlist_email_lower_idx ON public.game_waitlist (lower(email));

ALTER TABLE public.game_waitlist ENABLE ROW LEVEL SECURITY;

-- No anon access; inserts go through API route using service role.
