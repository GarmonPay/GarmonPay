-- Profit protection snapshots + platform settings hardening.
-- Run after existing financial migrations.

-- 1) Daily snapshot table
CREATE TABLE IF NOT EXISTS public.daily_profit_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL UNIQUE,
  advertiser_revenue_cents integer NOT NULL DEFAULT 0,
  member_payouts_cents integer NOT NULL DEFAULT 0,
  deferred_payouts_cents integer NOT NULL DEFAULT 0,
  profit_cents integer GENERATED ALWAYS AS (advertiser_revenue_cents - member_payouts_cents) STORED,
  profit_margin_percent numeric GENERATED ALWAYS AS (
    CASE
      WHEN advertiser_revenue_cents = 0 THEN 0
      ELSE (member_payouts_cents::numeric / advertiser_revenue_cents::numeric) * 100
    END
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2) Trigger helper to keep daily summary updated from transactions
CREATE OR REPLACE FUNCTION public.update_daily_profit_summary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_day date;
BEGIN
  v_day := (NEW.created_at AT TIME ZONE 'UTC')::date;

  INSERT INTO public.daily_profit_summary (date)
  VALUES (v_day)
  ON CONFLICT (date) DO NOTHING;

  IF NEW.type IN ('deposit', 'advertiser_payment') THEN
    UPDATE public.daily_profit_summary
    SET
      advertiser_revenue_cents = advertiser_revenue_cents + COALESCE(NEW.amount, 0)::integer,
      updated_at = now()
    WHERE date = v_day;
  END IF;

  IF NEW.type IN ('ad_view', 'task_complete', 'game_reward', 'referral_upgrade') THEN
    IF NEW.status = 'completed' THEN
      UPDATE public.daily_profit_summary
      SET
        member_payouts_cents = member_payouts_cents + COALESCE(NEW.amount, 0)::integer,
        updated_at = now()
      WHERE date = v_day;
    ELSIF NEW.status = 'deferred' THEN
      UPDATE public.daily_profit_summary
      SET
        deferred_payouts_cents = deferred_payouts_cents + COALESCE(NEW.amount, 0)::integer,
        updated_at = now()
      WHERE date = v_day;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_daily_profit_summary ON public.transactions;
CREATE TRIGGER trg_update_daily_profit_summary
AFTER INSERT ON public.transactions
FOR EACH ROW
EXECUTE PROCEDURE public.update_daily_profit_summary();

-- 3) Extend platform_settings for health-check controls
ALTER TABLE public.platform_settings
  ALTER COLUMN id TYPE integer USING (
    CASE WHEN id::text ~ '^[0-9]+$' THEN id::integer ELSE 1 END
  );

-- If id is an identity column, Postgres disallows SET DEFAULT.
-- Keep identity as-is in that case; otherwise set a singleton-friendly default.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'platform_settings'
      AND column_name = 'id'
      AND is_identity = 'YES'
  ) THEN
    -- no-op for identity columns
    NULL;
  ELSE
    EXECUTE 'ALTER TABLE public.platform_settings ALTER COLUMN id SET DEFAULT 1';
  END IF;
END
$$;

-- Ensure only singleton row id=1 can exist
ALTER TABLE public.platform_settings
  DROP CONSTRAINT IF EXISTS platform_settings_singleton_check;
ALTER TABLE public.platform_settings
  ADD CONSTRAINT platform_settings_singleton_check CHECK (id = 1);

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS earn_rate_multiplier numeric NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS daily_payout_cap_cents integer NOT NULL DEFAULT 50000,
  ADD COLUMN IF NOT EXISTS last_health_check timestamptz;

INSERT INTO public.platform_settings (id, earn_rate_multiplier, daily_payout_cap_cents, updated_at)
VALUES (1, 1.0, 50000, now())
ON CONFLICT (id) DO UPDATE
SET
  earn_rate_multiplier = COALESCE(public.platform_settings.earn_rate_multiplier, 1.0),
  daily_payout_cap_cents = COALESCE(public.platform_settings.daily_payout_cap_cents, 50000),
  updated_at = now();
