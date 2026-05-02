-- Legacy installs used column ran_at; align to created_at for SQL parity with app + docs.
DO $m$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'throttle_log' AND column_name = 'ran_at'
  )
     AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'throttle_log' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE public.throttle_log RENAME COLUMN ran_at TO created_at;
  END IF;
END $m$;

DROP INDEX IF EXISTS throttle_log_ran_at_desc;
CREATE INDEX IF NOT EXISTS throttle_log_created_at_desc ON public.throttle_log (created_at DESC);
