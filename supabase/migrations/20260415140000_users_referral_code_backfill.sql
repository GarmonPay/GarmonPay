-- Legacy rows: ensure every member has a referral_code (matches app: GARM- + md5 prefix).
UPDATE public.users
SET referral_code = 'GARM-' || upper(substring(md5(id::text), 1, 6))
WHERE referral_code IS NULL;
