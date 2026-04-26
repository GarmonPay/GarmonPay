-- Explicit posted-entry flags (UI + APIs use entry_posted / stake_amount_sc; legacy entry_sc kept in sync).
ALTER TABLE public.celo_room_players
  ADD COLUMN IF NOT EXISTS entry_posted boolean NOT NULL DEFAULT false;

ALTER TABLE public.celo_room_players
  ADD COLUMN IF NOT EXISTS stake_amount_sc integer NOT NULL DEFAULT 0;

ALTER TABLE public.celo_room_players
  ADD COLUMN IF NOT EXISTS player_seat_status text NOT NULL DEFAULT 'seated';

UPDATE public.celo_room_players
SET
  entry_posted = true,
  stake_amount_sc = GREATEST(COALESCE(entry_sc, 0), COALESCE(bet_cents, 0)),
  player_seat_status = 'active'
WHERE COALESCE(entry_sc, 0) > 0 OR COALESCE(bet_cents, 0) > 0;

COMMENT ON COLUMN public.celo_room_players.entry_posted IS 'True after player successfully posts a table entry for the current round window.';
COMMENT ON COLUMN public.celo_room_players.stake_amount_sc IS 'Posted entry stake in GPC (same scale as entry_sc).';
COMMENT ON COLUMN public.celo_room_players.player_seat_status IS 'seated | active (posted entry for current window).';
