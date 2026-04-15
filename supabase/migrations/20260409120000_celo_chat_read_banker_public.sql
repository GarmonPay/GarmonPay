-- Bankers and public-room visitors could not SELECT celo_chat when not in celo_room_players
-- (snapshot/API already bypassed this; this fixes direct reads + Realtime for those users).

DROP POLICY IF EXISTS "Users read chat" ON public.celo_chat;

CREATE POLICY "Users read chat"
  ON public.celo_chat FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.celo_rooms r
      WHERE r.id = celo_chat.room_id
        AND (
          r.banker_id = auth.uid()
          OR r.room_type = 'public'
          OR EXISTS (
            SELECT 1 FROM public.celo_room_players p
            WHERE p.room_id = r.id AND p.user_id = auth.uid()
          )
        )
    )
  );
