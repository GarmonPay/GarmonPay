-- Room delete failed: celo_audit_log.room_id FK blocked DELETE on celo_rooms.
-- Ensure audit rows are removed (or nulled) when a room is deleted.
ALTER TABLE public.celo_audit_log
  ALTER COLUMN room_id DROP NOT NULL;

ALTER TABLE public.celo_audit_log
  DROP CONSTRAINT IF EXISTS celo_audit_log_room_id_fkey;

ALTER TABLE public.celo_audit_log
  ADD CONSTRAINT celo_audit_log_room_id_fkey
  FOREIGN KEY (room_id) REFERENCES public.celo_rooms (id) ON DELETE CASCADE;

COMMENT ON CONSTRAINT celo_audit_log_room_id_fkey ON public.celo_audit_log IS
  'Deleting a C-Lo room cascades to its audit rows; API may also delete audit first for clarity.';
