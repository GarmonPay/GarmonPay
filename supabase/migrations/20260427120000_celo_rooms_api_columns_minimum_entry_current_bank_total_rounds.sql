-- celo_rooms: columns POST /api/celo/room/create expects; some DBs never had min_bet_cents
-- (renamed or only *_sc / current_bank_cents). Backfill only uses columns that exist.

ALTER TABLE public.celo_rooms ADD COLUMN IF NOT EXISTS minimum_entry_sc integer;
ALTER TABLE public.celo_rooms ADD COLUMN IF NOT EXISTS current_bank_sc integer;
ALTER TABLE public.celo_rooms ADD COLUMN IF NOT EXISTS total_rounds integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'celo_rooms' AND column_name = 'min_bet_cents'
  ) THEN
    UPDATE public.celo_rooms
    SET minimum_entry_sc = COALESCE(minimum_entry_sc, min_bet_cents)
    WHERE minimum_entry_sc IS NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'celo_rooms' AND column_name = 'current_bank_cents'
  ) THEN
    UPDATE public.celo_rooms
    SET current_bank_sc = COALESCE(current_bank_sc, current_bank_cents, 0)
    WHERE current_bank_sc IS NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.celo_rooms.minimum_entry_sc IS 'Minimum player entry (GPC cents); may mirror min_bet_cents when present.';
COMMENT ON COLUMN public.celo_rooms.current_bank_sc IS 'Table bank (GPC cents); may mirror current_bank_cents when present.';
COMMENT ON COLUMN public.celo_rooms.total_rounds IS 'Completed rounds count; incremented by trigger.';
