-- Bankers could read celo_rooms via banker_id but not celo_room_players for other
-- seats in non-public rooms (no celo_room_players row → celo_user_in_room false).
-- That broke SELECT + Realtime postgres_changes for player entries. Mirror
-- celo_player_rolls / celo_chat: allow read when parent room's banker_id = auth.uid().

DROP POLICY IF EXISTS "Players in room can read players" ON public.celo_room_players;
CREATE POLICY "Players in room can read players"
  ON public.celo_room_players FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.celo_rooms r
      WHERE r.id = celo_room_players.room_id
        AND (
          r.banker_id = auth.uid()
          OR r.room_type = 'public'
          OR r.room_type IS NULL
          OR public.celo_user_in_room(r.id)
        )
    )
  );
