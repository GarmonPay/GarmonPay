-- New Devnet mint inventory only. Does not read, update, or delete existing tables.
CREATE TABLE IF NOT EXISTS public.gp_sol_mint_inventory (
  id text PRIMARY KEY CHECK (id ~ '^[a-f0-9]{32}$'),
  mint text NOT NULL UNIQUE CHECK (mint ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}gpay$'),
  secret_ciphertext text NOT NULL,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available','reserved','submitting','uncertain','consumed','cancelled')),
  reserved_wallet text,
  draft_hash text,
  image_url text,
  name text,
  symbol text,
  reserved_at timestamptz,
  reservation_expires_at timestamptz,
  consumed_signature text,
  last_valid_block_height bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gp_sol_mint_inventory_wallet_chk CHECK (reserved_wallet IS NULL OR reserved_wallet ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$')
);

CREATE INDEX IF NOT EXISTS gp_sol_mint_inventory_available ON public.gp_sol_mint_inventory (created_at) WHERE status = 'available';
CREATE INDEX IF NOT EXISTS gp_sol_mint_inventory_wallet ON public.gp_sol_mint_inventory (reserved_wallet, reserved_at DESC);

ALTER TABLE public.gp_sol_mint_inventory ENABLE ROW LEVEL SECURITY;
