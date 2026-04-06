-- Optional mirror column for tooling / explicit selects alongside balance (cents).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS balance_cents bigint;

UPDATE public.profiles
SET balance_cents = ROUND(COALESCE(balance, 0))::bigint
WHERE balance_cents IS NULL;

COMMENT ON COLUMN public.profiles.balance_cents IS 'Wallet balance in cents; mirrors profiles.balance when present.';
