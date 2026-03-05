-- Index for webhook/recovery duplicate check by reference_id (Stripe session or payment_intent id)
CREATE INDEX IF NOT EXISTS transactions_reference_id_type ON public.transactions (reference_id, type) WHERE reference_id IS NOT NULL;
