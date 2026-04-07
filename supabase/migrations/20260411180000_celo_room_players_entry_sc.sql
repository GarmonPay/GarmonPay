-- Mirror stake in entry_sc for clients that read entry_sc; keep bet_cents in sync.
ALTER TABLE public.celo_room_players ADD COLUMN IF NOT EXISTS entry_sc integer;

UPDATE public.celo_room_players
SET entry_sc = COALESCE(bet_cents, 0)
WHERE entry_sc IS NULL;

ALTER TABLE public.celo_room_players ALTER COLUMN entry_sc SET DEFAULT 0;

COMMENT ON COLUMN public.celo_room_players.entry_sc IS 'Player entry stake in cents; should match bet_cents when both exist.';
