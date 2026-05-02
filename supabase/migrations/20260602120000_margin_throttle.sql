-- Margin auto-throttle: target vs effective payout cents + audit log.
-- Renames legacy columns from ec053fe; adds effective rates and throttle metadata.
-- Dollar-quote tags ($rename$, $func$) avoid Supabase SQL editor mangling bare $$ blocks.
-- platform_settings is treated as single-row; backfill does not filter by id.

DO $rename$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'platform_settings' AND column_name = 'click_payout_cents'
  ) THEN
    ALTER TABLE public.platform_settings RENAME COLUMN click_payout_cents TO click_payout_target_cents;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'platform_settings' AND column_name = 'view_payout_cents'
  ) THEN
    ALTER TABLE public.platform_settings RENAME COLUMN view_payout_cents TO view_payout_target_cents;
  END IF;
END $rename$;

ALTER TABLE public.platform_settings ADD COLUMN IF NOT EXISTS click_payout_target_cents integer NOT NULL DEFAULT 5;
ALTER TABLE public.platform_settings ADD COLUMN IF NOT EXISTS view_payout_target_cents integer NOT NULL DEFAULT 1;

ALTER TABLE public.platform_settings ADD COLUMN IF NOT EXISTS click_payout_effective_cents integer NOT NULL DEFAULT 5;
ALTER TABLE public.platform_settings ADD COLUMN IF NOT EXISTS view_payout_effective_cents integer NOT NULL DEFAULT 1;
ALTER TABLE public.platform_settings ADD COLUMN IF NOT EXISTS throttle_active boolean NOT NULL DEFAULT false;
ALTER TABLE public.platform_settings ADD COLUMN IF NOT EXISTS throttle_last_run_at timestamptz;
ALTER TABLE public.platform_settings ADD COLUMN IF NOT EXISTS throttle_last_margin_pct numeric(5, 2);

-- Align effective to target where still unset (nullable legacy path); safe no-op when both NOT NULL from ADD COLUMN defaults.
UPDATE public.platform_settings
SET
  click_payout_effective_cents = click_payout_target_cents,
  view_payout_effective_cents = view_payout_target_cents
WHERE click_payout_effective_cents IS NULL
   OR view_payout_effective_cents IS NULL;

COMMENT ON COLUMN public.platform_settings.click_payout_target_cents IS 'Admin target: max member payout per click (cents) in legacy range.';
COMMENT ON COLUMN public.platform_settings.view_payout_target_cents IS 'Admin target: max member payout per view (cents) in legacy range.';
COMMENT ON COLUMN public.platform_settings.click_payout_effective_cents IS 'Actual payout floor after margin throttle; never exceeds target.';
COMMENT ON COLUMN public.platform_settings.view_payout_effective_cents IS 'Actual payout floor after margin throttle; never exceeds target.';

CREATE TABLE IF NOT EXISTS public.throttle_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at timestamptz NOT NULL DEFAULT now(),
  observed_margin_pct numeric(8, 4),
  action_taken text NOT NULL,
  prev_click_effective integer,
  new_click_effective integer,
  prev_view_effective integer,
  new_view_effective integer,
  notes text
);

CREATE INDEX IF NOT EXISTS throttle_log_ran_at_desc ON public.throttle_log (ran_at DESC);

COMMENT ON TABLE public.throttle_log IS 'Margin throttle cron and manual override audit log.';

ALTER TABLE public.throttle_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full throttle_log" ON public.throttle_log;
CREATE POLICY "Service role full throttle_log"
  ON public.throttle_log FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Rolling 24h margin inputs: platform revenue (USD cents) vs GPay ledger positive available deltas (minor units).
CREATE OR REPLACE FUNCTION public.garmon_margin_last_24h()
RETURNS TABLE (revenue_cents bigint, payout_cents bigint)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $func$
DECLARE
  r bigint;
  p bigint;
BEGIN
  SELECT coalesce(sum(pe.amount_cents), 0)::bigint
  INTO r
  FROM public.platform_earnings pe
  WHERE pe.created_at >= now() - interval '24 hours';

  SELECT coalesce(sum(gl.delta_available_minor), 0)::bigint
  INTO p
  FROM public.gpay_ledger gl
  WHERE gl.created_at >= now() - interval '24 hours'
    AND gl.delta_available_minor > 0;

  RETURN QUERY SELECT r, p;
END;
$func$;

COMMENT ON FUNCTION public.garmon_margin_last_24h() IS
  'Rolling 24h: sum(platform_earnings.amount_cents) as revenue_cents; sum(gpay_ledger.delta_available_minor) where delta > 0 as payout_cents (GPay minor).';

GRANT EXECUTE ON FUNCTION public.garmon_margin_last_24h() TO service_role;
