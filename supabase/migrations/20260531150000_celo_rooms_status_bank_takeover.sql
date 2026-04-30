-- Allow explicit bank takeover / awaiting funding after bust without confusing clients with generic "waiting".
ALTER TABLE public.celo_rooms
  DROP CONSTRAINT IF EXISTS celo_rooms_status_check;

ALTER TABLE public.celo_rooms
  ADD CONSTRAINT celo_rooms_status_check
  CHECK (status IN (
    'waiting',
    'entry_phase',
    'active',
    'rolling',
    'completed',
    'cancelled',
    'bank_takeover'
  ));

COMMENT ON CONSTRAINT celo_rooms_status_check ON public.celo_rooms IS
  'bank_takeover: new banker assigned, bank at 0 — fund before play.';
