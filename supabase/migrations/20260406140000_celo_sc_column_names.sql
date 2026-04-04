-- Match app roll route: *_cents → *_sc on celo_rounds and celo_player_rolls (idempotent)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'celo_rounds' AND column_name = 'platform_fee_cents'
  ) THEN
    ALTER TABLE public.celo_rounds RENAME COLUMN platform_fee_cents TO platform_fee_sc;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'celo_rounds' AND column_name = 'total_pot_cents'
  ) THEN
    ALTER TABLE public.celo_rounds RENAME COLUMN total_pot_cents TO total_pot_sc;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'celo_player_rolls' AND column_name = 'bet_cents'
  ) THEN
    ALTER TABLE public.celo_player_rolls RENAME COLUMN bet_cents TO entry_sc;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'celo_player_rolls' AND column_name = 'payout_cents'
  ) THEN
    ALTER TABLE public.celo_player_rolls RENAME COLUMN payout_cents TO payout_sc;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'celo_player_rolls' AND column_name = 'platform_fee_cents'
  ) THEN
    ALTER TABLE public.celo_player_rolls RENAME COLUMN platform_fee_cents TO platform_fee_sc;
  END IF;
END $$;
