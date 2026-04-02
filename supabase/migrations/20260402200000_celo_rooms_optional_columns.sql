-- Optional columns referenced by C-Lo API routes; safe on DBs that only had core + _sc columns.
ALTER TABLE public.celo_rooms ADD COLUMN IF NOT EXISTS last_round_was_celo boolean NOT NULL DEFAULT false;
ALTER TABLE public.celo_rooms ADD COLUMN IF NOT EXISTS banker_celo_at timestamptz;
ALTER TABLE public.celo_rooms ADD COLUMN IF NOT EXISTS platform_fee_pct integer NOT NULL DEFAULT 10
  CHECK (platform_fee_pct >= 0 AND platform_fee_pct <= 100);
ALTER TABLE public.celo_rooms ADD COLUMN IF NOT EXISTS max_bet_cents integer DEFAULT 10000;
