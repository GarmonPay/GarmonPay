-- Ensure referral_commission_config exists and service role has full access (fix "Failed to update" on admin Referrals page).
CREATE TABLE IF NOT EXISTS public.referral_commission_config (
  membership_tier text PRIMARY KEY CHECK (membership_tier IN ('starter', 'pro', 'elite', 'vip')),
  commission_percentage numeric(5,2) NOT NULL CHECK (commission_percentage >= 0 AND commission_percentage <= 100),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.referral_commission_config (membership_tier, commission_percentage)
VALUES
  ('starter', 10),
  ('pro', 15),
  ('elite', 20),
  ('vip', 25)
ON CONFLICT (membership_tier) DO NOTHING;

ALTER TABLE public.referral_commission_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role commission config" ON public.referral_commission_config;
DROP POLICY IF EXISTS "Service role full access referral_commission_config" ON public.referral_commission_config;

CREATE POLICY "Service role full access referral_commission_config"
  ON public.referral_commission_config
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
