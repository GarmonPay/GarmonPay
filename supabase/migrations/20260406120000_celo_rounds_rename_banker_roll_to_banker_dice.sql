-- Align column names with app: banker_roll* -> banker_dice* (idempotent if already renamed)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'celo_rounds' AND column_name = 'banker_roll'
  ) THEN
    ALTER TABLE public.celo_rounds RENAME COLUMN banker_roll TO banker_dice;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'celo_rounds' AND column_name = 'banker_roll_name'
  ) THEN
    ALTER TABLE public.celo_rounds RENAME COLUMN banker_roll_name TO banker_dice_name;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'celo_rounds' AND column_name = 'banker_roll_result'
  ) THEN
    ALTER TABLE public.celo_rounds RENAME COLUMN banker_roll_result TO banker_dice_result;
  END IF;
END $$;
