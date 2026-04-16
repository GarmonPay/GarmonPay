-- C-Lo lobby: allow reading public waiting rooms when room_type IS NULL (legacy rows).
-- Allow authenticated users to read banker profiles for rows shown in the lobby (embed on celo_rooms).
-- Idempotent: ensure celo_rooms stays in supabase_realtime.

-- 1) SELECT on celo_rooms: treat NULL room_type like public for lobby visibility
DROP POLICY IF EXISTS "Members read rooms" ON public.celo_rooms;
CREATE POLICY "Members read rooms"
  ON public.celo_rooms FOR SELECT TO authenticated
  USING (
    (room_type = 'public' OR room_type IS NULL)
    OR creator_id = auth.uid()
    OR banker_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.celo_room_players p
      WHERE p.room_id = celo_rooms.id AND p.user_id = auth.uid()
    )
  );

-- 2) So the lobby query can embed banker:users(...) — read minimal exposure for bankers in listed rooms
DROP POLICY IF EXISTS "Celo lobby read banker profiles" ON public.users;
CREATE POLICY "Celo lobby read banker profiles"
  ON public.users FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.celo_rooms r
      WHERE r.banker_id = users.id
        AND r.banker_id IS NOT NULL
        AND (r.room_type = 'public' OR r.room_type IS NULL)
        AND r.status IN ('waiting', 'active', 'rolling')
    )
  );

-- 3) Realtime publication (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'celo_rooms'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.celo_rooms;
    END IF;
  END IF;
END $$;
