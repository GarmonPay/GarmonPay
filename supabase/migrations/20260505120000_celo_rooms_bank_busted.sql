-- Track when the table bank hit zero without an immediate new banker assignment.
ALTER TABLE public.celo_rooms
  ADD COLUMN IF NOT EXISTS bank_busted boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.celo_rooms.bank_busted IS
  'True when current_bank_sc reached 0 and no new banker was assigned yet; cleared when a banker is set and the bank can be re-funded.';
