-- Street C-Lo: short stop (void roll / banker caps / optional "no short stop" declare)

ALTER TABLE public.celo_rounds
  ADD COLUMN IF NOT EXISTS no_short_stop boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS banker_short_stops_used integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS banker_short_stops_max integer NOT NULL DEFAULT 3;

ALTER TABLE public.celo_player_rolls
  ADD COLUMN IF NOT EXISTS voided_by_short_stop boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS short_stop_called_by text;

COMMENT ON COLUMN public.celo_rounds.no_short_stop IS 'When true, banker declared "no short stop"; player short-stop calls forfeit instead of voiding.';
COMMENT ON COLUMN public.celo_player_rolls.voided_by_short_stop IS 'True when this roll was voided by short stop; player must reroll.';
COMMENT ON COLUMN public.celo_player_rolls.short_stop_called_by IS 'player or banker';

-- Allow outcome lost_short_stop (illegal short stop when no_short_stop declared)
ALTER TABLE public.celo_player_rolls DROP CONSTRAINT IF EXISTS celo_player_rolls_outcome_check;
ALTER TABLE public.celo_player_rolls
  ADD CONSTRAINT celo_player_rolls_outcome_check
  CHECK (outcome IS NULL OR outcome IN ('win', 'loss', 'reroll', 'lost_short_stop'));
