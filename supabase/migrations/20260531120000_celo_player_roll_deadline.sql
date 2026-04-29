-- Server-authoritative deadline for the current player's roll (UTC).

ALTER TABLE public.celo_rounds
  ADD COLUMN IF NOT EXISTS player_roll_deadline_at timestamptz;

COMMENT ON COLUMN public.celo_rounds.player_roll_deadline_at IS
  'When the current player must roll by. If exceeded, stake is forfeited as a banker win (platform fee applies).';
