-- Banker abandonment cleanup: track processing and allow cancelling stuck rounds.

ALTER TABLE public.celo_rooms
  ADD COLUMN IF NOT EXISTS abandonment_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS abandoned_at timestamptz,
  ADD COLUMN IF NOT EXISTS abandonment_fee_charged boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.celo_rooms.abandonment_checked_at IS 'Last time a cron/job evaluated abandonment for this room.';
COMMENT ON COLUMN public.celo_rooms.abandoned_at IS 'When the room was closed due to banker inactivity / abandonment cleanup.';
COMMENT ON COLUMN public.celo_rooms.abandonment_fee_charged IS 'True after a 500 GPC abandonment fee was assessed (or attempted idempotently).';

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.celo_rounds'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.celo_rounds DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.celo_rounds
  ADD CONSTRAINT celo_rounds_status_check
  CHECK (status IN (
    'betting',
    'banker_rolling',
    'player_rolling',
    'completed',
    'cancelled'
  ));

COMMENT ON CONSTRAINT celo_rounds_status_check ON public.celo_rounds IS
  'cancelled: round voided (e.g. banker abandonment cleanup).';
