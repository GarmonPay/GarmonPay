-- Allow 10-player C-Lo rooms (previously only 2, 4, 6)
ALTER TABLE public.celo_rooms DROP CONSTRAINT IF EXISTS celo_rooms_max_players_check;
ALTER TABLE public.celo_rooms ADD CONSTRAINT celo_rooms_max_players_check
  CHECK (max_players IN (2, 4, 6, 10));
