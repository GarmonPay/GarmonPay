-- Retire unused vanity mint rows and allow a normal Solana mint address.
-- Does not delete rows or touch any other table.

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT con.conname INTO constraint_name
  FROM pg_constraint AS con
  WHERE con.conrelid = 'public.gp_sol_mint_inventory'::regclass
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) LIKE '%gpay%';
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.gp_sol_mint_inventory DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;

ALTER TABLE public.gp_sol_mint_inventory
  DROP CONSTRAINT IF EXISTS gp_sol_mint_inventory_mint_format;

ALTER TABLE public.gp_sol_mint_inventory
  ADD CONSTRAINT gp_sol_mint_inventory_mint_format
  CHECK (mint ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$');

UPDATE public.gp_sol_mint_inventory
SET status = 'cancelled',
    secret_ciphertext = 'retired',
    reserved_wallet = NULL,
    draft_hash = NULL,
    image_url = NULL,
    name = NULL,
    symbol = NULL,
    reserved_at = NULL,
    reservation_expires_at = NULL,
    last_valid_block_height = NULL
WHERE consumed_signature IS NULL
  AND status IN ('available', 'reserved');
