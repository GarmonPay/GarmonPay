-- C-Lo engine: add columns required by the game engine API routes.
-- Idempotent: ADD COLUMN IF NOT EXISTS throughout.

-- ─── celo_rooms: live bank tracking + post-C-Lo lower-bank window ────────────
ALTER TABLE public.celo_rooms
  ADD COLUMN IF NOT EXISTS current_bank_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS banker_celo_at     timestamptz,
  ADD COLUMN IF NOT EXISTS last_round_was_celo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.celo_rooms.current_bank_cents  IS 'Active bank amount in cents; grows on banker wins, shrinks on player wins.';
COMMENT ON COLUMN public.celo_rooms.banker_celo_at      IS 'Timestamp of last C-Lo roll by banker; lower-bank window is 60s from this.';
COMMENT ON COLUMN public.celo_rooms.last_round_was_celo IS 'True if the last completed round ended with a banker C-Lo; enables lower-bank offer.';

-- ─── celo_rounds: bank-covered mechanic ──────────────────────────────────────
ALTER TABLE public.celo_rounds
  ADD COLUMN IF NOT EXISTS bank_covered boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS covered_by   uuid REFERENCES public.users (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.celo_rounds.bank_covered IS 'True when one player has covered the full bank for this round (heads-up with banker).';
COMMENT ON COLUMN public.celo_rounds.covered_by   IS 'The player who covered the bank; only this player rolls against the banker.';

-- ─── celo_player_rolls: timestamp for 30s become-banker offer ────────────────
ALTER TABLE public.celo_player_rolls
  ADD COLUMN IF NOT EXISTS player_celo_at timestamptz;

COMMENT ON COLUMN public.celo_player_rolls.player_celo_at IS 'Set when player rolls C-Lo; banker-accept offer expires 30s after this.';

-- ─── celo_room_players: custom dice ──────────────────────────────────────────
ALTER TABLE public.celo_room_players
  ADD COLUMN IF NOT EXISTS dice_type       text        NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS dice_quantity   integer     NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS dice_expires_at timestamptz;

COMMENT ON COLUMN public.celo_room_players.dice_type       IS 'Active custom dice skin (standard by default; expires after 24h).';
COMMENT ON COLUMN public.celo_room_players.dice_quantity   IS 'Number of custom dice purchased (1–3).';
COMMENT ON COLUMN public.celo_room_players.dice_expires_at IS 'Custom dice expire at this timestamp and revert to standard.';
