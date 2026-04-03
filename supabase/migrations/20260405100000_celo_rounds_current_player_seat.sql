-- Turn order for C-Lo player phase (whose seat may roll vs banker point)
ALTER TABLE public.celo_rounds
  ADD COLUMN IF NOT EXISTS current_player_seat integer DEFAULT 1;

COMMENT ON COLUMN public.celo_rounds.current_player_seat IS 'Seat number of the player who may roll; advances after each resolving roll.';
