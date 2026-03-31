-- C-Lo: banker reroll tracking + player reroll count (optional audit)

ALTER TABLE public.celo_rounds
  ADD COLUMN IF NOT EXISTS banker_rerolls integer NOT NULL DEFAULT 0;

ALTER TABLE public.celo_player_rolls
  ADD COLUMN IF NOT EXISTS reroll_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.celo_rounds.banker_rerolls IS 'How many banker no-count rerolls occurred before resolution (max 2 before third forces loss).';
COMMENT ON COLUMN public.celo_player_rolls.reroll_count IS 'No-count rerolls consumed before a resolving roll (for player).';
