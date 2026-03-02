-- Recovery: stripe_payments metadata and unique stripe_session_id for ON CONFLICT
ALTER TABLE public.stripe_payments ADD COLUMN IF NOT EXISTS metadata jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS stripe_payments_stripe_session_id_key ON public.stripe_payments (stripe_session_id) WHERE stripe_session_id IS NOT NULL;
