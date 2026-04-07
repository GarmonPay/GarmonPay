-- Tax info acknowledgment (W-9 on file — self-service); atomic increment for reportable payouts
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tax_info_submitted_at timestamptz;

COMMENT ON COLUMN public.profiles.tax_info_submitted_at IS 'When user certified tax information is on file (e.g. W-9 submitted to support).';

CREATE OR REPLACE FUNCTION public.increment_profile_reportable_earnings(p_user_id uuid, p_delta_cents bigint)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new bigint;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN 0;
  END IF;
  IF p_delta_cents IS NULL OR p_delta_cents <= 0 THEN
    SELECT COALESCE(reportable_earnings_cents, 0) INTO v_new FROM public.profiles WHERE id = p_user_id;
    RETURN COALESCE(v_new, 0);
  END IF;

  INSERT INTO public.profiles (id, reportable_earnings_cents)
  VALUES (p_user_id, p_delta_cents)
  ON CONFLICT (id) DO UPDATE
    SET reportable_earnings_cents = COALESCE(public.profiles.reportable_earnings_cents, 0) + EXCLUDED.reportable_earnings_cents;

  SELECT reportable_earnings_cents INTO v_new FROM public.profiles WHERE id = p_user_id;
  RETURN COALESCE(v_new, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.increment_profile_reportable_earnings(uuid, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_profile_reportable_earnings(uuid, bigint) TO service_role;

COMMENT ON FUNCTION public.increment_profile_reportable_earnings IS 'Atomically add cents to profiles.reportable_earnings_cents (withdrawals paid / external payouts).';
