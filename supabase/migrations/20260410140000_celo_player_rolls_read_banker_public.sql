-- Bankers and public-room viewers were excluded from SELECT on celo_player_rolls,
-- so Realtime postgres_changes for player rolls never reached them (only seated players saw INSERTs).

DROP POLICY IF EXISTS "Users read rolls" ON public.celo_player_rolls;

CREATE POLICY "Users read rolls"
  ON public.celo_player_rolls FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.celo_rooms r
      WHERE r.id = celo_player_rolls.room_id
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
