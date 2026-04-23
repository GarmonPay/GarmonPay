-- Server-side audit: stable links from celo_side_bets rows to coin_transactions.reference
ALTER TABLE public.celo_side_bets
  ADD COLUMN IF NOT EXISTS creator_debit_ref text,
  ADD COLUMN IF NOT EXISTS acceptor_debit_ref text;

COMMENT ON COLUMN public.celo_side_bets.creator_debit_ref IS 'coin_transactions.reference when creator posted (celo_side_create_*)';
COMMENT ON COLUMN public.celo_side_bets.acceptor_debit_ref IS 'coin_transactions.reference when acceptor matched (celo_side_accept_<betId>_<userId>)';
