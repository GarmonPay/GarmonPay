-- Net banker P&L for the round (positive = banker won matched net; negative = banker paid net to winners).
ALTER TABLE public.celo_rounds
  ADD COLUMN IF NOT EXISTS banker_winnings_sc integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.celo_rounds.banker_winnings_sc IS
  'Matched-stake net won (+) or lost (−) by the banker this round after per-stake platform fee; aligns with celo_rooms.current_bank_sc delta.';
