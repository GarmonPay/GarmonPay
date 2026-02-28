-- Table to track Stripe checkout sessions already credited by recovery script.
-- Prevents double-crediting when recover-payments is run multiple times.
CREATE TABLE IF NOT EXISTS public.recovered_stripe_sessions (
  session_id text PRIMARY KEY,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Ensure users.total_deposits exists for webhook and recovery
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS total_deposits numeric DEFAULT 0;

COMMENT ON TABLE public.recovered_stripe_sessions IS 'Stripe checkout session IDs already credited by admin recover-payments script';
