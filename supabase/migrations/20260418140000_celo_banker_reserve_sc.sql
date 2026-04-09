-- C-Lo: fixed banker liability cap (cents) for server-side "remaining cover" vs sum of player stakes.
-- Mirrors starting bank at room creation; does not float with live current_bank during play.

ALTER TABLE public.celo_rooms ADD COLUMN IF NOT EXISTS banker_reserve_sc integer;

COMMENT ON COLUMN public.celo_rooms.banker_reserve_sc IS
  'Maximum total player stake liability the banker reserved at table open (cents). Used with sum(player bet_cents) to enforce coverage.';

-- Backfill: use live bank snapshot (covers legacy rows before this column existed).
UPDATE public.celo_rooms
SET banker_reserve_sc = GREATEST(
  COALESCE(banker_reserve_sc, 0),
  COALESCE(current_bank_sc, current_bank_cents, 0)
)
WHERE banker_reserve_sc IS NULL OR banker_reserve_sc = 0;

-- Default for new rows (app always sets explicitly on create)
ALTER TABLE public.celo_rooms ALTER COLUMN banker_reserve_sc SET DEFAULT 0;
