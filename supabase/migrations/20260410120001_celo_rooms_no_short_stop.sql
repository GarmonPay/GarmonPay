-- Banker "no short stop" rule (street): stored on room so it can be set before a round starts.
ALTER TABLE public.celo_rooms
  ADD COLUMN IF NOT EXISTS no_short_stop boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.celo_rooms.no_short_stop IS
  'When true, covering player short stop on banker roll = auto loss (per house rule).';
