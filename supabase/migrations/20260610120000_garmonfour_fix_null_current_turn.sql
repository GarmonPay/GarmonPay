-- Repair active games where both players are seated but current_turn was never set (stuck: no moves, Forfeit only).

CREATE OR REPLACE FUNCTION public.garmonfour_fix_null_current_turn(p_room_id uuid, p_now timestamptz)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.garmonfour_rooms
  SET
    current_turn = CASE
      WHEN mod(move_seq, 2) = 0 THEN creator_id
      ELSE opponent_id
    END,
    updated_at = p_now
  WHERE id = p_room_id
    AND status = 'active'
    AND opponent_id IS NOT NULL
    AND current_turn IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.garmonfour_fix_null_current_turn(uuid, timestamptz) FROM PUBLIC;

-- Backfill existing broken rows
UPDATE public.garmonfour_rooms
SET
  current_turn = CASE
    WHEN mod(move_seq, 2) = 0 THEN creator_id
    ELSE opponent_id
  END,
  updated_at = now()
WHERE status = 'active'
  AND opponent_id IS NOT NULL
  AND current_turn IS NULL;

CREATE OR REPLACE FUNCTION public.garmonfour_repair_turn_atomic(p_room_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.garmonfour_rooms%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  IF p_room_id IS NULL OR p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'room and user required');
  END IF;

  SELECT * INTO v_room FROM public.garmonfour_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Room not found');
  END IF;

  IF p_user_id <> v_room.creator_id AND p_user_id <> v_room.opponent_id THEN
    RETURN jsonb_build_object('success', false, 'message', 'Not a player in this room');
  END IF;

  PERFORM public.garmonfour_fix_null_current_turn(p_room_id, v_now);
  SELECT * INTO v_room FROM public.garmonfour_rooms WHERE id = p_room_id;

  RETURN jsonb_build_object('success', true, 'room', row_to_json(v_room)::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.garmonfour_repair_turn_atomic(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.garmonfour_repair_turn_atomic(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.garmonfour_make_move_atomic(
  p_room_id uuid,
  p_user_id uuid,
  p_column int,
  p_expected_seq int,
  p_reference text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.garmonfour_rooms%ROWTYPE;
  v_now timestamptz := now();
  v_board jsonb;
  vr int;
  vc int := p_column;
  v_piece int;
  v_won boolean;
  v_full boolean;
  v_pot bigint;
  v_fee int;
  v_winner_payout bigint;
  v_winner uuid;
  v_refund_a bigint;
  v_refund_b bigint;
  v_other uuid;
BEGIN
  IF p_room_id IS NULL OR p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'room and user required');
  END IF;
  IF p_column < 0 OR p_column > 6 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid column');
  END IF;
  IF p_reference IS NULL OR trim(p_reference) = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'reference required');
  END IF;

  IF EXISTS (SELECT 1 FROM public.garmonfour_moves WHERE reference = p_reference) THEN
    SELECT * INTO v_room FROM public.garmonfour_rooms WHERE id = p_room_id;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'room', row_to_json(v_room)::jsonb
      );
    END IF;
    RETURN jsonb_build_object('success', false, 'message', 'Duplicate reference');
  END IF;

  SELECT * INTO v_room FROM public.garmonfour_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Room not found');
  END IF;

  PERFORM public.garmonfour_fix_null_current_turn(p_room_id, v_now);
  SELECT * INTO v_room FROM public.garmonfour_rooms WHERE id = p_room_id;

  IF v_room.status <> 'active' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Game is not active');
  END IF;

  IF v_room.current_turn IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('success', false, 'message', 'Not your turn');
  END IF;

  IF v_room.move_seq IS DISTINCT FROM p_expected_seq THEN
    RETURN jsonb_build_object('success', false, 'message', 'Stale move sequence; refresh state');
  END IF;

  IF p_user_id <> v_room.creator_id AND p_user_id <> v_room.opponent_id THEN
    RETURN jsonb_build_object('success', false, 'message', 'Not a player in this room');
  END IF;

  v_piece := CASE WHEN p_user_id = v_room.creator_id THEN 1 ELSE 2 END;
  v_board := v_room.board_state;

  vr := -1;
  FOR rloop IN REVERSE 5..0 LOOP
    IF public.garmonfour_cell(v_board, rloop, vc) = 0 THEN
      vr := rloop;
      EXIT;
    END IF;
  END LOOP;

  IF vr < 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Column is full');
  END IF;

  v_board := jsonb_set(v_board, ARRAY[vr::text, vc::text], to_jsonb(v_piece), true);
  v_won := public.garmonfour_has_winner(v_board, vr, vc, v_piece);
  v_full := public.garmonfour_board_full(v_board);

  INSERT INTO public.garmonfour_moves (room_id, move_seq, user_id, col, row, reference)
  VALUES (p_room_id, p_expected_seq, p_user_id, vc, vr, p_reference);

  v_pot := v_room.pot_total_minor;
  v_fee := floor(v_pot * 0.1);

  IF v_won THEN
    v_winner := p_user_id;
    v_winner_payout := v_pot - v_fee;

    UPDATE public.users
    SET gpay_coins = gpay_coins + v_winner_payout
    WHERE id = v_winner;

    INSERT INTO public.coin_transactions (
      user_id, type, gold_coins, gpay_coins, description, reference
    ) VALUES (
      v_winner, 'garmonfour_win', 0, v_winner_payout,
      'GarmonFour win payout', 'garmonfour_win_' || p_room_id::text
    );

    PERFORM public.garmonfour_record_platform_fee(
      p_room_id,
      v_fee,
      v_winner,
      'garmonfour_fee_' || p_room_id::text
    );

    UPDATE public.garmonfour_rooms
    SET
      board_state = v_board,
      status = 'completed',
      winner_id = v_winner,
      platform_fee_minor = v_fee,
      winner_payout_minor = v_winner_payout,
      current_turn = NULL,
      move_seq = p_expected_seq + 1,
      completed_at = v_now,
      updated_at = v_now
    WHERE id = p_room_id;

    SELECT * INTO v_room FROM public.garmonfour_rooms WHERE id = p_room_id;
    RETURN jsonb_build_object(
      'success', true,
      'outcome', 'win',
      'winner_id', v_winner,
      'room', row_to_json(v_room)::jsonb
    );
  END IF;

  IF v_full THEN
    v_refund_a := (v_pot - v_fee) / 2;
    v_refund_b := (v_pot - v_fee) - v_refund_a;

    UPDATE public.users SET gpay_coins = gpay_coins + v_refund_a WHERE id = v_room.creator_id;
    UPDATE public.users SET gpay_coins = gpay_coins + v_refund_b WHERE id = v_room.opponent_id;

    INSERT INTO public.coin_transactions (
      user_id, type, gold_coins, gpay_coins, description, reference
    ) VALUES
      (v_room.creator_id, 'garmonfour_draw_refund', 0, v_refund_a,
       'GarmonFour draw refund', 'garmonfour_draw_' || p_room_id::text || '_a'),
      (v_room.opponent_id, 'garmonfour_draw_refund', 0, v_refund_b,
       'GarmonFour draw refund', 'garmonfour_draw_' || p_room_id::text || '_b');

    PERFORM public.garmonfour_record_platform_fee(
      p_room_id,
      v_fee,
      v_room.creator_id,
      'garmonfour_fee_' || p_room_id::text
    );

    UPDATE public.garmonfour_rooms
    SET
      board_state = v_board,
      status = 'completed',
      winner_id = NULL,
      platform_fee_minor = v_fee,
      winner_payout_minor = 0,
      current_turn = NULL,
      move_seq = p_expected_seq + 1,
      completed_at = v_now,
      updated_at = v_now
    WHERE id = p_room_id;

    SELECT * INTO v_room FROM public.garmonfour_rooms WHERE id = p_room_id;
    RETURN jsonb_build_object(
      'success', true,
      'outcome', 'draw',
      'room', row_to_json(v_room)::jsonb
    );
  END IF;

  v_other := CASE WHEN p_user_id = v_room.creator_id THEN v_room.opponent_id ELSE v_room.creator_id END;

  UPDATE public.garmonfour_rooms
  SET
    board_state = v_board,
    current_turn = v_other,
    move_seq = p_expected_seq + 1,
    updated_at = v_now
  WHERE id = p_room_id;

  SELECT * INTO v_room FROM public.garmonfour_rooms WHERE id = p_room_id;
  RETURN jsonb_build_object(
    'success', true,
    'outcome', 'continue',
    'room', row_to_json(v_room)::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.garmonfour_make_move_atomic(uuid, uuid, integer, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.garmonfour_make_move_atomic(uuid, uuid, integer, integer, text) TO service_role;
