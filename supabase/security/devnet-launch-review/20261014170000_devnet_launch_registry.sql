-- Devnet-only confirmed launches. No balances, permissions on existing tables, or Mainnet operations.
BEGIN;
CREATE TABLE public.gp_sol_devnet_launches (
 mint text PRIMARY KEY CHECK (mint ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
 creator_wallet text NOT NULL CHECK (creator_wallet ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'),
 signature text NOT NULL UNIQUE CHECK (signature ~ '^[1-9A-HJ-NP-Za-km-z]{80,90}$'),
 pool text NOT NULL UNIQUE,
 platform text NOT NULL,
 name text NOT NULL CHECK (length(name) BETWEEN 1 AND 32),
 symbol text NOT NULL CHECK (symbol ~ '^[A-Z0-9]{1,10}$'),
 description text NOT NULL CHECK (length(description) <= 2000),
 metadata_uri text NOT NULL,
 image_url text NOT NULL DEFAULT '',
 cluster text NOT NULL DEFAULT 'devnet' CHECK (cluster = 'devnet'),
 confirmation text NOT NULL DEFAULT 'finalized' CHECK (confirmation = 'finalized'),
 curve_type text NOT NULL DEFAULT 'virtual_constant_product' CHECK (curve_type = 'virtual_constant_product'),
 verified_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX gp_sol_devnet_launches_creator ON public.gp_sol_devnet_launches(creator_wallet,verified_at DESC);
ALTER TABLE public.gp_sol_devnet_launches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gp_sol_devnet_launches FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.gp_sol_devnet_launches TO service_role;
COMMIT;
