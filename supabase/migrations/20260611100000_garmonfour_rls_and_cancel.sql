-- GarmonFour: lock direct table writes and add secure cancel RPC.

CREATE OR REPLACE FUNCTION public.garmonfour_cancel_room(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_room public.garmonfour_rooms%ROWTYPE;
  v_now timestamptz := now();
  v_amt int;
  v_ref text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Unauthorized');
  END IF;
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'room_id required');
  END IF;

  SELECT * INTO v_room
  FROM public.garmonfour_rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Room not found');
  END IF;

  IF v_room.creator_id <> v_uid THEN
    RETURN jsonb_build_object('success', false, 'message', 'Only the room creator can cancel');
  END IF;

  IF v_room.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true);
  END IF;

  IF v_room.status <> 'waiting' OR v_room.opponent_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Room cannot be cancelled');
  END IF;

  v_amt := GREATEST(0, COALESCE(v_room.entry_amount_minor, 0));
  v_ref := 'garmonfour_cancel_' || p_room_id::text;

  UPDATE public.users
  SET gpay_coins = gpay_coins + v_amt
  WHERE id = v_uid;

  INSERT INTO public.coin_transactions (
    user_id, type, gold_coins, gpay_coins, description, reference
  ) VALUES (
    v_uid, 'garmonfour_refund', 0, v_amt,
    'GarmonFour cancel waiting room', v_ref
  );

  UPDATE public.garmonfour_rooms
  SET status = 'cancelled', updated_at = v_now, completed_at = v_now
  WHERE id = p_room_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.garmonfour_cancel_room(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.garmonfour_cancel_room(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.garmonfour_cancel_room(uuid) TO service_role;

DROP POLICY IF EXISTS "garmonfour_rooms_insert_deny_all" ON public.garmonfour_rooms;
CREATE POLICY "garmonfour_rooms_insert_deny_all"
  ON public.garmonfour_rooms FOR INSERT TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "garmonfour_rooms_update_deny_all" ON public.garmonfour_rooms;
CREATE POLICY "garmonfour_rooms_update_deny_all"
  ON public.garmonfour_rooms FOR UPDATE TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "garmonfour_rooms_delete_deny_all" ON public.garmonfour_rooms;
CREATE POLICY "garmonfour_rooms_delete_deny_all"
  ON public.garmonfour_rooms FOR DELETE TO authenticated
  USING (false);
