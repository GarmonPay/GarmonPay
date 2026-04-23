-- Server-authoritative signal: banker API is mid-throw (tumble on all clients before banker_dice updates).
ALTER TABLE public.celo_rounds
  ADD COLUMN IF NOT EXISTS banker_roll_in_flight boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.celo_rounds.banker_roll_in_flight IS
  'True while POST /api/celo/round/roll is processing a banker throw; cleared when dice/outcome are persisted. Enables remote tumble even when banker_dice still holds a prior no_count.';
