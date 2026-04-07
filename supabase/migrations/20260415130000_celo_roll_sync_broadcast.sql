-- Server-authoritative dice roll animation sync: timestamps for reconnect + single active round guard.

ALTER TABLE public.celo_rounds
  ADD COLUMN IF NOT EXISTS roll_animation_start_at timestamptz,
  ADD COLUMN IF NOT EXISTS roll_animation_duration_ms integer NOT NULL DEFAULT 2800;

COMMENT ON COLUMN public.celo_rounds.roll_animation_start_at IS 'UTC time when all clients should start the shared roll animation (banker roll).';
COMMENT ON COLUMN public.celo_rounds.roll_animation_duration_ms IS 'Tumbling duration before revealing final dice (banker roll).';

ALTER TABLE public.celo_player_rolls
  ADD COLUMN IF NOT EXISTS roll_animation_start_at timestamptz,
  ADD COLUMN IF NOT EXISTS roll_animation_duration_ms integer NOT NULL DEFAULT 2800;

COMMENT ON COLUMN public.celo_player_rolls.roll_animation_start_at IS 'UTC time when all clients should start the shared roll animation (player roll).';
COMMENT ON COLUMN public.celo_player_rolls.roll_animation_duration_ms IS 'Tumbling duration before revealing final dice (player roll).';
