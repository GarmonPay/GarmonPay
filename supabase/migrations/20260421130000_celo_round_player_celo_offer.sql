-- Player C-Lo → optional become-banker offer (30s window tracked server-side).

ALTER TABLE public.celo_rounds
  ADD COLUMN IF NOT EXISTS player_celo_offer boolean NOT NULL DEFAULT false;

ALTER TABLE public.celo_rounds
  ADD COLUMN IF NOT EXISTS player_celo_expires_at timestamptz;

COMMENT ON COLUMN public.celo_rounds.player_celo_offer IS 'True when a player rolled C-Lo (4-5-6) and may accept banker role within the offer window.';
COMMENT ON COLUMN public.celo_rounds.player_celo_expires_at IS 'UTC expiry for the become-banker offer (typically 30s after the C-Lo roll).';
