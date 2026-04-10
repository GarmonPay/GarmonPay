-- Ensure outcome CHECK allows lost_short_stop (some DBs used a different constraint name than celo_player_rolls_outcome_check)

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND t.relname = 'celo_player_rolls'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%outcome%'
  LOOP
    EXECUTE format('ALTER TABLE public.celo_player_rolls DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.celo_player_rolls
  ADD CONSTRAINT celo_player_rolls_outcome_check
  CHECK (outcome IS NULL OR outcome IN ('win', 'loss', 'reroll', 'lost_short_stop'));
