-- Immutable audit trail for wallet ledger entries (Supabase service role inserts from app).
CREATE TABLE IF NOT EXISTS public.balance_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  amount_cents bigint NOT NULL,
  reason text NOT NULL,
  stripe_payment_id text,
  reference text,
  ledger_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS balance_audit_log_user_created_at
  ON public.balance_audit_log (user_id, created_at DESC);

ALTER TABLE public.balance_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role balance_audit_log" ON public.balance_audit_log;
CREATE POLICY "Service role balance_audit_log"
  ON public.balance_audit_log FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

COMMENT ON TABLE public.balance_audit_log IS 'Append-only style log of wallet balance changes (mirrors successful wallet_ledger_entry calls).';
