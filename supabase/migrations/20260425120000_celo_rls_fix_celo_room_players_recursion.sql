-- Break infinite RLS recursion on celo_room_players:
-- "Members read rooms" queried celo_room_players; "Players in room can read players"
-- queried celo_rooms and self-joined celo_room_players — each re-invoked the other.
-- Membership checks use SECURITY DEFINER so they do not re-enter RLS.

CREATE OR REPLACE FUNCTION public.celo_user_in_room(_room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.celo_room_players
    WHERE room_id = _room_id AND user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.celo_user_in_room(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.celo_user_in_room(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.celo_user_in_room(uuid) TO service_role;

COMMENT ON FUNCTION public.celo_user_in_room(uuid) IS
  'True if the current user has a row in celo_room_players for the room (uses SECURITY DEFINER to avoid RLS recursion).';

-- 1) celo_rooms — replace EXISTS (SELECT ... celo_room_players) with helper
DROP POLICY IF EXISTS "Members read rooms" ON public.celo_rooms;
CREATE POLICY "Members read rooms"
  ON public.celo_rooms FOR SELECT TO authenticated
  USING (
    (room_type = 'public' OR room_type IS NULL)
    OR creator_id = auth.uid()
    OR banker_id = auth.uid()
    OR public.celo_user_in_room(id)
  );

-- 2) celo_room_players — replace self-join with helper; keep public/null lobby visibility
DROP POLICY IF EXISTS "Players in room can read players" ON public.celo_room_players;
CREATE POLICY "Players in room can read players"
  ON public.celo_room_players FOR SELECT TO authenticated
  USING (
    public.celo_user_in_room(celo_room_players.room_id)
    OR EXISTS (
      SELECT 1 FROM public.celo_rooms r
      WHERE r.id = celo_room_players.room_id
        AND (r.room_type = 'public' OR r.room_type IS NULL)
    )
  );

-- 3) celo_rounds
DROP POLICY IF EXISTS "Users read rounds" ON public.celo_rounds;
CREATE POLICY "Users read rounds"
  ON public.celo_rounds FOR SELECT TO authenticated
  USING (
    public.celo_user_in_room(celo_rounds.room_id)
    OR EXISTS (
      SELECT 1 FROM public.celo_rooms r
      WHERE r.id = celo_rounds.room_id
        AND (r.room_type = 'public' OR r.room_type IS NULL)
    )
  );

-- 4) celo_player_rolls — preserve banker + public + seated (replaces nested EXISTS)
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
          OR r.room_type IS NULL
          OR public.celo_user_in_room(r.id)
        )
    )
  );

-- 5) celo_side_bets
DROP POLICY IF EXISTS "Users read side bets" ON public.celo_side_bets;
CREATE POLICY "Users read side bets"
  ON public.celo_side_bets FOR SELECT TO authenticated
  USING (
    public.celo_user_in_room(celo_side_bets.room_id)
    OR EXISTS (
      SELECT 1 FROM public.celo_rooms r
      WHERE r.id = celo_side_bets.room_id
        AND (r.room_type = 'public' OR r.room_type IS NULL)
    )
  );

-- 6) celo_chat — preserve banker + public + seated
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
          OR r.room_type IS NULL
          OR public.celo_user_in_room(r.id)
        )
    )
  );
