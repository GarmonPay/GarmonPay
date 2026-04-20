-- coin_transactions originally used sweeps_coins (20260409120001). Later renames to gpay_coins (20260423140000).
-- If production never applied that rename, RPCs/inserts referencing gpay_coins fail. Align schema idempotently.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'coin_transactions'
      AND column_name = 'sweeps_coins'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'coin_transactions'
      AND column_name = 'gpay_coins'
  ) THEN
    ALTER TABLE public.coin_transactions RENAME COLUMN sweeps_coins TO gpay_coins;
  END IF;
END $$;

-- Edge case: table without a GPC column (should not happen if prior block ran).
ALTER TABLE public.coin_transactions
  ADD COLUMN IF NOT EXISTS gpay_coins integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.coin_transactions.gpay_coins IS 'GPay Coins (GPC) delta for this ledger row; negative = debit, positive = credit.';
