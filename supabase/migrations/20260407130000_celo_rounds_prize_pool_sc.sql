-- Rename total_pot_sc → prize_pool_sc (align with round/start route)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'celo_rounds' AND column_name = 'total_pot_sc'
  ) THEN
    ALTER TABLE public.celo_rounds RENAME COLUMN total_pot_sc TO prize_pool_sc;
  END IF;
END $$;
