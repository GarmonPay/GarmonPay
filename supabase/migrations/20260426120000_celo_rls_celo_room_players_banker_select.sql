-- 20260425120000's recursion fix for celo_room_players redefined SELECT using only
-- celo_user_in_room and public-lobby visibility. That dropped banker_id from
-- 20260418194600, so a banker with no row in celo_room_players could not read
-- other seats' entries in a private room (Start round stayed disabled; UI empty).
-- Restore banker read; still no self-join on celo_room_players (no recursion).
DROP POLICY IF EXISTS "Players in room can read players" ON public.celo_room_players;
CREATE POLICY "Players in room can read players"
  ON public.celo_room_players FOR SELECT TO authenticated
  USING (
    public.celo_user_in_room(celo_room_players.room_id)
    OR EXISTS (
      SELECT 1
      FROM public.celo_rooms r
      WHERE r.id = celo_room_players.room_id
        AND (
          r.banker_id = auth.uid()
          OR r.room_type = 'public'
          OR r.room_type IS NULL
        )
    )
  );
