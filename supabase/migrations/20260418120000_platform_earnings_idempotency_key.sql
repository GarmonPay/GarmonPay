-- Idempotent C-Lo (and other) platform fee lines: stable key prevents double-counting on retries.
ALTER TABLE public.platform_earnings
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS platform_earnings_idempotency_key_unique
  ON public.platform_earnings (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
