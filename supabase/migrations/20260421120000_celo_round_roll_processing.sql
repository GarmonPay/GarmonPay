-- Server-authoritative roll coordination + audit timestamps for C-Lo rounds.
-- roll_processing: true while POST /api/celo/round/roll is applying a roll (prevents duplicate taps).
-- roller_user_id: who initiated the in-flight roll (optional UI / debugging).

ALTER TABLE public.celo_rounds
  ADD COLUMN IF NOT EXISTS roll_processing boolean NOT NULL DEFAULT false;

ALTER TABLE public.celo_rounds
  ADD COLUMN IF NOT EXISTS roller_user_id uuid REFERENCES public.users (id) ON DELETE SET NULL;

ALTER TABLE public.celo_rounds
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.celo_rounds.roll_processing IS 'True while the server is applying a dice roll for this round; cleared when the roll row is fully persisted.';
COMMENT ON COLUMN public.celo_rounds.roller_user_id IS 'User id of the client that triggered the current or last in-flight roll.';
COMMENT ON COLUMN public.celo_rounds.updated_at IS 'Last write time for round state (rolls, status, seats).';
