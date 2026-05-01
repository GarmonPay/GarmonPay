-- Admin-editable member payout floors for Garmon ads (cents). API enforces 0–100.

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS click_payout_cents integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS view_payout_cents integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.platform_settings.click_payout_cents IS 'Member payout per click (cents) when ad cost_per_click is in legacy range; default 5¢ matches former GARMON_AD_RATES.click.';
COMMENT ON COLUMN public.platform_settings.view_payout_cents IS 'Member payout per view (cents) when ad cost_per_view is in legacy range; default 1¢ matches former banner_view rate.';
