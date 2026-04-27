-- Push (point tie): mark round + allow celo_player_rolls outcome 'push'

ALTER TABLE public.celo_rounds
  ADD COLUMN IF NOT EXISTS push boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.celo_rounds.push IS 'True when the round ended in a point tie vs banker; main-table stakes refunded.';

ALTER TABLE public.celo_player_rolls DROP CONSTRAINT IF EXISTS celo_player_rolls_outcome_check;

ALTER TABLE public.celo_player_rolls
  ADD CONSTRAINT celo_player_rolls_outcome_check
  CHECK (outcome IS NULL OR outcome IN ('win', 'loss', 'reroll', 'lost_short_stop', 'push'));
