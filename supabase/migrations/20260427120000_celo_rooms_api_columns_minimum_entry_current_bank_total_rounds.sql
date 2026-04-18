-- celo_rooms: columns POST /api/celo/room/create inserts were never added in older migrations
-- (only min_bet_cents / current_bank_cents existed). Without these, room creation returns 500
-- "Failed to create room".

ALTER TABLE public.celo_rooms ADD COLUMN IF NOT EXISTS minimum_entry_sc integer;
ALTER TABLE public.celo_rooms ADD COLUMN IF NOT EXISTS current_bank_sc integer;
ALTER TABLE public.celo_rooms ADD COLUMN IF NOT EXISTS total_rounds integer NOT NULL DEFAULT 0;

UPDATE public.celo_rooms
SET
  minimum_entry_sc = COALESCE(minimum_entry_sc, min_bet_cents),
  current_bank_sc = COALESCE(current_bank_sc, current_bank_cents, 0)
WHERE minimum_entry_sc IS NULL OR current_bank_sc IS NULL;

COMMENT ON COLUMN public.celo_rooms.minimum_entry_sc IS 'Minimum player entry (GPC cents); keep in sync with min_bet_cents.';
COMMENT ON COLUMN public.celo_rooms.current_bank_sc IS 'Table bank (GPC cents); keep in sync with current_bank_cents.';
COMMENT ON COLUMN public.celo_rooms.total_rounds IS 'Completed rounds count; incremented by trigger.';
