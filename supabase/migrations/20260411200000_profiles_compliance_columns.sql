-- Simple compliance: DOB, residence state, running total for $600 / 1099-style prompts later
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS date_of_birth date;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS residence_state text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS reportable_earnings_cents bigint NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.profiles.date_of_birth IS 'User-declared DOB at signup (18+ attestation).';
COMMENT ON COLUMN public.profiles.residence_state IS 'US state code at signup; used for eligibility (e.g. WA excluded).';
COMMENT ON COLUMN public.profiles.reportable_earnings_cents IS 'Cumulative reportable payouts; use for $600 tax info threshold.';

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS date_of_birth date;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS residence_state text;

COMMENT ON COLUMN public.users.date_of_birth IS 'Mirror of profiles.date_of_birth for admin/reporting.';
COMMENT ON COLUMN public.users.residence_state IS 'Mirror of profiles.residence_state.';
