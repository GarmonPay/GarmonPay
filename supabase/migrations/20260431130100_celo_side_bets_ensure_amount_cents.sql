-- PostgREST "Could not find the 'amount_cents' column of 'celo_side_bets'":
-- some databases have partial DDL or used amount_sc for GPC stake.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'celo_side_bets'
      AND column_name = 'amount_sc'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'celo_side_bets'
      AND column_name = 'amount_cents'
  ) THEN
    ALTER TABLE public.celo_side_bets RENAME COLUMN amount_sc TO amount_cents;
  END IF;
END $$;

ALTER TABLE public.celo_side_bets
  ADD COLUMN IF NOT EXISTS amount_cents integer;

UPDATE public.celo_side_bets
SET amount_cents = GREATEST(COALESCE(amount_cents, 0), 100)
WHERE amount_cents IS NULL OR amount_cents <= 0;

ALTER TABLE public.celo_side_bets
  ALTER COLUMN amount_cents SET DEFAULT 100;

ALTER TABLE public.celo_side_bets
  ALTER COLUMN amount_cents SET NOT NULL;

COMMENT ON COLUMN public.celo_side_bets.amount_cents IS 'Side-bet stake in GPC minor units (legacy column name uses _cents).';
