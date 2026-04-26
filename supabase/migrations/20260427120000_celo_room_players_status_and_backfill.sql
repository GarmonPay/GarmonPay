-- Canonical: entry_posted, stake_amount_sc, status (seated|active) on celo_room_players.
-- Backfill legacy rows that have entry_sc / bet_cents so UI staked count matches data.

ALTER TABLE public.celo_room_players
  ADD COLUMN IF NOT EXISTS entry_posted boolean NOT NULL DEFAULT false;
ALTER TABLE public.celo_room_players
  ADD COLUMN IF NOT EXISTS stake_amount_sc integer NOT NULL DEFAULT 0;
ALTER TABLE public.celo_room_players
  ADD COLUMN IF NOT EXISTS player_seat_status text NOT NULL DEFAULT 'seated';
ALTER TABLE public.celo_room_players
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'seated';

UPDATE public.celo_room_players
SET status = TRIM(COALESCE(player_seat_status, 'seated'))
WHERE player_seat_status IS NOT NULL
  AND TRIM(COALESCE(player_seat_status, '')) != '';

UPDATE public.celo_room_players
SET
  entry_posted = true,
  stake_amount_sc = GREATEST(
    COALESCE(stake_amount_sc, 0),
    COALESCE(entry_sc, 0),
    COALESCE(bet_cents, 0)
  ),
  status = 'active',
  player_seat_status = 'active'
WHERE
  (COALESCE(entry_sc, 0) > 0 OR COALESCE(bet_cents, 0) > 0);

COMMENT ON COLUMN public.celo_room_players.status IS 'seated | active — posted entry for this table window.';
