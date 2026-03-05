-- Ensure Stripe webhook transaction reference column exists.
ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS stripe_session text;

CREATE INDEX IF NOT EXISTS transactions_stripe_session_idx
  ON public.transactions (stripe_session);
