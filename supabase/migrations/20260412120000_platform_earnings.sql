-- Aggregate platform fee from C-Lo and other sources (reporting; not user balances)
CREATE TABLE IF NOT EXISTS public.platform_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  source_id text,
  amount_cents integer NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_earnings_source_created ON public.platform_earnings (source, created_at DESC);

COMMENT ON TABLE public.platform_earnings IS 'Platform revenue lines (fees). Inserted from server; not exposed to clients by default.';

ALTER TABLE public.platform_earnings ENABLE ROW LEVEL SECURITY;
