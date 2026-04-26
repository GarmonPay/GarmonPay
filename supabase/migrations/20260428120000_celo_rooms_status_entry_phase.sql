-- Banker opens entry window before any stake is taken: room.status = 'entry_phase'
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
    'cancelled'
  ));

COMMENT ON CONSTRAINT celo_rooms_status_check ON public.celo_rooms IS
  'entry_phase: players may post entries; active/rolling: round in progress.';
