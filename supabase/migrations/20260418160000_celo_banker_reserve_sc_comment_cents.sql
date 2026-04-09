-- Clarify units: banker_reserve_sc is integer US cents (same scale as current_bank_sc, minimum_entry_sc).

COMMENT ON COLUMN public.celo_rooms.banker_reserve_sc IS
  'Maximum sum of active player table stakes (integer US cents). Liability cap — not a duplicate wallet balance; paired with ledger debits on create/bank top-up.';
