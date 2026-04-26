-- Lobby embed: include rooms in entry_phase so listed tables still resolve banker profile
DROP POLICY IF EXISTS "Celo lobby read banker profiles" ON public.users;
CREATE POLICY "Celo lobby read banker profiles"
  ON public.users FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.celo_rooms r
      WHERE r.banker_id = users.id
        AND r.banker_id IS NOT NULL
        AND (r.room_type = 'public' OR r.room_type IS NULL)
        AND r.status IN ('waiting', 'entry_phase', 'active', 'rolling')
    )
  );
