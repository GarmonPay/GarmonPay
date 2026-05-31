-- Rename GarmonFour → GarmonDrop: teardown legacy objects, rebuild as garmondrop_*.

-- ---------------------------------------------------------------------------
-- TEARDOWN: drop all garmonfour objects (no legacy remains)
-- ---------------------------------------------------------------------------

-- Remove from realtime publication before dropping tables
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'garmonfour_rooms'
    ) THEN
      ALTER PUBLICATION supabase_realtime DROP TABLE public.garmonfour_rooms;
    END IF;
  END IF;
END $$;

DROP TABLE IF EXISTS public.garmonfour_moves CASCADE;
DROP TABLE IF EXISTS public.garmonfour_rooms CASCADE;

DROP FUNCTION IF EXISTS public.garmonfour_make_move_atomic(uuid, uuid, integer, integer, text) CASCADE;
DROP FUNCTION IF EXISTS public.garmonfour_post_entry_atomic(text, uuid, uuid, integer, text) CASCADE;
DROP FUNCTION IF EXISTS public.garmonfour_forfeit_atomic(uuid, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.garmonfour_cancel_waiting_atomic(uuid, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.garmonfour_cancel_room(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.garmonfour_repair_turn_atomic(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.garmonfour_fix_null_current_turn(uuid, timestamptz) CASCADE;
DROP FUNCTION IF EXISTS public.garmonfour_record_platform_fee(uuid, integer, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.garmonfour_has_winner(jsonb, integer, integer, integer) CASCADE;
DROP FUNCTION IF EXISTS public.garmonfour_board_full(jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.garmonfour_count_dir(jsonb, integer, integer, integer, integer, integer) CASCADE;
DROP FUNCTION IF EXISTS public.garmonfour_cell(jsonb, integer, integer) CASCADE;
DROP FUNCTION IF EXISTS public.garmonfour_empty_board() CASCADE;

-- ---------------------------------------------------------------------------
-- REBUILD: garmondrop schema (concatenated migrations 091 → 101 → 111 → 131)
-- ---------------------------------------------------------------------------

-- === from 20260609120000_garmondrop_pvp.sql (source) ===

-- GarmonDrop: PvP Connect Four, GPC stakes, 10% platform fee on pot (same economics as Coin Flip PvP).

CREATE OR REPLACE FUNCTION public.garmondrop_empty_board() RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT '[
    [0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0]
  ]'::jsonb;
$$;

CREATE OR REPLACE FUNCTION public.garmondrop_cell(g jsonb, r int, c int) RETURNS int
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v jsonb;
BEGIN
  IF r < 0 OR r > 5 OR c < 0 OR c > 6 THEN
    RETURN -1;
  END IF;
  v := g -> r -> c;
  IF v IS NULL OR jsonb_typeof(v) = 'null' THEN
    RETURN 0;
  END IF;
  RETURN (v #>> '{}')::int;
END;
$$;

CREATE OR REPLACE FUNCTION public.garmondrop_count_dir(
  g jsonb, pr int, pc int, val int, dr int, dc int
) RETURNS int
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  cnt int := 0;
  r int;
  c int;
  cell int;
BEGIN
  r := pr;
  c := pc;
  LOOP
    cell := public.garmondrop_cell(g, r, c);
    EXIT WHEN cell <> val;
    cnt := cnt + 1;
    r := r + dr;
    c := c + dc;
  END LOOP;
  RETURN cnt;
END;
$$;

CREATE OR REPLACE FUNCTION public.garmondrop_has_winner(
  g jsonb, pr int, pc int, val int
) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF val <> 1 AND val <> 2 THEN
    RETURN false;
  END IF;
  RETURN
    public.garmondrop_count_dir(g, pr, pc, val, 0, 1) + public.garmondrop_count_dir(g, pr, pc, val, 0, -1) - 1 >= 4
    OR public.garmondrop_count_dir(g, pr, pc, val, 1, 0) + public.garmondrop_count_dir(g, pr, pc, val, -1, 0) - 1 >= 4
    OR public.garmondrop_count_dir(g, pr, pc, val, 1, 1) + public.garmondrop_count_dir(g, pr, pc, val, -1, -1) - 1 >= 4
    OR public.garmondrop_count_dir(g, pr, pc, val, 1, -1) + public.garmondrop_count_dir(g, pr, pc, val, -1, 1) - 1 >= 4;
END;
$$;

CREATE OR REPLACE FUNCTION public.garmondrop_board_full(g jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  c int;
BEGIN
  FOR c IN 0..6 LOOP
    IF public.garmondrop_cell(g, 0, c) = 0 THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

CREATE TABLE IF NOT EXISTS public.garmondrop_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  opponent_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  entry_amount_minor integer NOT NULL CHECK (entry_amount_minor >= 100),
  status text NOT NULL CHECK (status IN ('waiting', 'active', 'completed', 'cancelled')),
  board_state jsonb NOT NULL DEFAULT (public.garmondrop_empty_board()),
  current_turn uuid REFERENCES public.users (id) ON DELETE SET NULL,
  winner_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  pot_total_minor bigint NOT NULL DEFAULT 0,
  platform_fee_minor bigint NOT NULL DEFAULT 0,
  winner_payout_minor bigint NOT NULL DEFAULT 0,
  move_seq integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS garmondrop_rooms_status_created ON public.garmondrop_rooms (status, created_at DESC);
CREATE INDEX IF NOT EXISTS garmondrop_rooms_creator ON public.garmondrop_rooms (creator_id);

CREATE TABLE IF NOT EXISTS public.garmondrop_moves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.garmondrop_rooms (id) ON DELETE CASCADE,
  move_seq integer NOT NULL,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  col integer NOT NULL CHECK (col >= 0 AND col <= 6),
  row integer NOT NULL CHECK (row >= 0 AND row <= 5),
  reference text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, move_seq),
  UNIQUE (reference)
);

CREATE INDEX IF NOT EXISTS garmondrop_moves_room ON public.garmondrop_moves (room_id, move_seq);

ALTER TABLE public.garmondrop_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.garmondrop_moves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "garmondrop_rooms_select" ON public.garmondrop_rooms;
CREATE POLICY "garmondrop_rooms_select"
  ON public.garmondrop_rooms FOR SELECT TO authenticated
  USING (
    status = 'waiting'
    OR creator_id = auth.uid()
    OR opponent_id = auth.uid()
  );

DROP POLICY IF EXISTS "garmondrop_moves_select" ON public.garmondrop_moves;
CREATE POLICY "garmondrop_moves_select"
  ON public.garmondrop_moves FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.garmondrop_rooms r
      WHERE r.id = garmondrop_moves.room_id
        AND (
          r.status = 'waiting'
          OR r.creator_id = auth.uid()
          OR r.opponent_id = auth.uid()
        )
    )
  );

-- ---------------------------------------------------------------------------
-- Platform fee (idempotent) — mirror coin_flip_record_platform_fee
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.garmondrop_record_platform_fee(
  p_room_id uuid,
  p_amount_gpc integer,
  p_context_user_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount integer := GREATEST(0, COALESCE(p_amount_gpc, 0));
  v_key text := NULLIF(trim(COALESCE(p_idempotency_key, '')), '');
  v_inserted_id uuid;
BEGIN
  IF v_amount <= 0 THEN
    RETURN jsonb_build_object('inserted', false, 'reason', 'non_positive_amount');
  END IF;
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('inserted', false, 'reason', 'room_id_required');
  END IF;
  IF v_key IS NULL THEN
    RETURN jsonb_build_object('inserted', false, 'reason', 'idempotency_key_required');
  END IF;

  INSERT INTO public.platform_earnings (
    source,
    source_id,
    amount_cents,
    description,
    user_id,
    idempotency_key
  )
  VALUES (
    'garmondrop_platform_fee',
    p_room_id::text,
    v_amount,
    'GarmonDrop PvP platform fee (10% of pot)',
    p_context_user_id,
    v_key
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NULL THEN
    RETURN jsonb_build_object('inserted', false, 'reason', 'duplicate_or_conflict');
  END IF;

  PERFORM public.platform_record_revenue(v_amount::bigint, 'garmondrop_fee');

  RETURN jsonb_build_object('inserted', true, 'id', v_inserted_id, 'idempotency_key', v_key);
END;
$$;

REVOKE ALL ON FUNCTION public.garmondrop_record_platform_fee(uuid, integer, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.garmondrop_record_platform_fee(uuid, integer, uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- post_entry: 'create' | 'join'
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.garmondrop_post_entry_atomic(
  p_op text,
  p_room_id uuid,
  p_user_id uuid,
  p_entry_amount integer,
  p_reference text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_op text := lower(trim(COALESCE(p_op, '')));
  v_now timestamptz := now();
  v_room public.garmondrop_rooms%ROWTYPE;
  v_amt int;
  v_new_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'user_id required');
  END IF;
  IF p_reference IS NULL OR trim(p_reference) = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'reference required');
  END IF;
  IF EXISTS (SELECT 1 FROM public.coin_transactions WHERE reference = p_reference) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Duplicate transaction');
  END IF;

  v_amt := floor(COALESCE(p_entry_amount, 0));
  IF v_amt < 100 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Entry must be at least 100 GPC');
  END IF;

  IF v_op = 'create' THEN
    IF p_room_id IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'message', 'room_id must be null for create');
    END IF;

    UPDATE public.users u
    SET gpay_coins = u.gpay_coins - v_amt
    WHERE u.id = p_user_id AND u.gpay_coins >= v_amt;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'message', 'Insufficient GPay Coins');
    END IF;

    INSERT INTO public.coin_transactions (
      user_id, type, gold_coins, gpay_coins, description, reference
    ) VALUES (
      p_user_id, 'garmondrop_stake', 0, -v_amt,
      'GarmonDrop stake (create room)', p_reference
    );

    INSERT INTO public.garmondrop_rooms (
      creator_id, entry_amount_minor, status, board_state, move_seq, updated_at
    ) VALUES (
      p_user_id, v_amt, 'waiting', public.garmondrop_empty_board(), 0, v_now
    )
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object('success', true, 'room_id', v_new_id);
  END IF;

  IF v_op = 'join' THEN
    IF p_room_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'message', 'room_id required to join');
    END IF;

    SELECT * INTO v_room FROM public.garmondrop_rooms WHERE id = p_room_id FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'message', 'Room not found');
    END IF;

    IF v_room.status <> 'waiting' OR v_room.opponent_id IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'message', 'Room is not open');
    END IF;

    IF v_room.creator_id = p_user_id THEN
      RETURN jsonb_build_object('success', false, 'message', 'Cannot join your own room');
    END IF;

    IF v_room.entry_amount_minor <> v_amt THEN
      RETURN jsonb_build_object('success', false, 'message', 'Entry amount must match room stake');
    END IF;

    UPDATE public.users u
    SET gpay_coins = u.gpay_coins - v_amt
    WHERE u.id = p_user_id AND u.gpay_coins >= v_amt;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'message', 'Insufficient GPay Coins');
    END IF;

    INSERT INTO public.coin_transactions (
      user_id, type, gold_coins, gpay_coins, description, reference
    ) VALUES (
      p_user_id, 'garmondrop_stake', 0, -v_amt,
      'GarmonDrop stake (join room)', p_reference
    );

    UPDATE public.garmondrop_rooms
    SET
      opponent_id = p_user_id,
      status = 'active',
      current_turn = creator_id,
      pot_total_minor = (entry_amount_minor::bigint * 2),
      board_state = public.garmondrop_empty_board(),
      move_seq = 0,
      updated_at = v_now
    WHERE id = p_room_id;

    RETURN jsonb_build_object('success', true, 'room_id', p_room_id);
  END IF;

  RETURN jsonb_build_object('success', false, 'message', 'Invalid op; use create or join');
END;
$$;

REVOKE ALL ON FUNCTION public.garmondrop_post_entry_atomic(text, uuid, uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.garmondrop_post_entry_atomic(text, uuid, uuid, integer, text) TO service_role;

-- ---------------------------------------------------------------------------
-- make_move
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.garmondrop_make_move_atomic(
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
  v_room public.garmondrop_rooms%ROWTYPE;
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

  IF EXISTS (SELECT 1 FROM public.garmondrop_moves WHERE reference = p_reference) THEN
    SELECT * INTO v_room FROM public.garmondrop_rooms WHERE id = p_room_id;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'room', row_to_json(v_room)::jsonb
      );
    END IF;
    RETURN jsonb_build_object('success', false, 'message', 'Duplicate reference');
  END IF;

  SELECT * INTO v_room FROM public.garmondrop_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Room not found');
  END IF;

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
    IF public.garmondrop_cell(v_board, rloop, vc) = 0 THEN
      vr := rloop;
      EXIT;
    END IF;
  END LOOP;

  IF vr < 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Column is full');
  END IF;

  v_board := jsonb_set(v_board, ARRAY[vr::text, vc::text], to_jsonb(v_piece), true);
  v_won := public.garmondrop_has_winner(v_board, vr, vc, v_piece);
  v_full := public.garmondrop_board_full(v_board);

  INSERT INTO public.garmondrop_moves (room_id, move_seq, user_id, col, row, reference)
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
      v_winner, 'garmondrop_win', 0, v_winner_payout,
      'GarmonDrop win payout', 'garmondrop_win_' || p_room_id::text
    );

    PERFORM public.garmondrop_record_platform_fee(
      p_room_id,
      v_fee,
      v_winner,
      'garmondrop_fee_' || p_room_id::text
    );

    UPDATE public.garmondrop_rooms
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

    SELECT * INTO v_room FROM public.garmondrop_rooms WHERE id = p_room_id;
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
      (v_room.creator_id, 'garmondrop_draw_refund', 0, v_refund_a,
       'GarmonDrop draw refund', 'garmondrop_draw_' || p_room_id::text || '_a'),
      (v_room.opponent_id, 'garmondrop_draw_refund', 0, v_refund_b,
       'GarmonDrop draw refund', 'garmondrop_draw_' || p_room_id::text || '_b');

    PERFORM public.garmondrop_record_platform_fee(
      p_room_id,
      v_fee,
      v_room.creator_id,
      'garmondrop_fee_' || p_room_id::text
    );

    UPDATE public.garmondrop_rooms
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

    SELECT * INTO v_room FROM public.garmondrop_rooms WHERE id = p_room_id;
    RETURN jsonb_build_object(
      'success', true,
      'outcome', 'draw',
      'room', row_to_json(v_room)::jsonb
    );
  END IF;

  v_other := CASE WHEN p_user_id = v_room.creator_id THEN v_room.opponent_id ELSE v_room.creator_id END;

  UPDATE public.garmondrop_rooms
  SET
    board_state = v_board,
    current_turn = v_other,
    move_seq = p_expected_seq + 1,
    updated_at = v_now
  WHERE id = p_room_id;

  SELECT * INTO v_room FROM public.garmondrop_rooms WHERE id = p_room_id;
  RETURN jsonb_build_object(
    'success', true,
    'outcome', 'continue',
    'room', row_to_json(v_room)::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.garmondrop_make_move_atomic(uuid, uuid, integer, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.garmondrop_make_move_atomic(uuid, uuid, integer, integer, text) TO service_role;

-- ---------------------------------------------------------------------------
-- forfeit: active game only; other player wins
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.garmondrop_forfeit_atomic(
  p_room_id uuid,
  p_user_id uuid,
  p_reference text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.garmondrop_rooms%ROWTYPE;
  v_now timestamptz := now();
  v_winner uuid;
  v_pot bigint;
  v_fee int;
  v_winner_payout bigint;
BEGIN
  IF p_room_id IS NULL OR p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'room and user required');
  END IF;
  IF p_reference IS NULL OR trim(p_reference) = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'reference required');
  END IF;

  IF EXISTS (SELECT 1 FROM public.coin_transactions WHERE reference = p_reference) THEN
    SELECT * INTO v_room FROM public.garmondrop_rooms WHERE id = p_room_id;
    IF FOUND AND v_room.status = 'completed' THEN
      RETURN jsonb_build_object('success', true, 'idempotent', true, 'room', row_to_json(v_room)::jsonb);
    END IF;
    RETURN jsonb_build_object('success', false, 'message', 'Duplicate reference');
  END IF;

  SELECT * INTO v_room FROM public.garmondrop_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Room not found');
  END IF;

  IF v_room.status <> 'active' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Game is not active');
  END IF;

  IF p_user_id <> v_room.creator_id AND p_user_id <> v_room.opponent_id THEN
    RETURN jsonb_build_object('success', false, 'message', 'Not a player in this room');
  END IF;

  v_winner := CASE WHEN p_user_id = v_room.creator_id THEN v_room.opponent_id ELSE v_room.creator_id END;
  v_pot := v_room.pot_total_minor;
  v_fee := floor(v_pot * 0.1);
  v_winner_payout := v_pot - v_fee;

  UPDATE public.users
  SET gpay_coins = gpay_coins + v_winner_payout
  WHERE id = v_winner;

  INSERT INTO public.coin_transactions (
    user_id, type, gold_coins, gpay_coins, description, reference
  ) VALUES (
    v_winner, 'garmondrop_win', 0, v_winner_payout,
    'GarmonDrop win (forfeit)', p_reference
  );

  PERFORM public.garmondrop_record_platform_fee(
    p_room_id,
    v_fee,
    v_winner,
    'garmondrop_fee_' || p_room_id::text
  );

  UPDATE public.garmondrop_rooms
  SET
    status = 'completed',
    winner_id = v_winner,
    platform_fee_minor = v_fee,
    winner_payout_minor = v_winner_payout,
    current_turn = NULL,
    completed_at = v_now,
    updated_at = v_now
  WHERE id = p_room_id;

  SELECT * INTO v_room FROM public.garmondrop_rooms WHERE id = p_room_id;
  RETURN jsonb_build_object(
    'success', true,
    'outcome', 'forfeit',
    'winner_id', v_winner,
    'room', row_to_json(v_room)::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.garmondrop_forfeit_atomic(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.garmondrop_forfeit_atomic(uuid, uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- cancel waiting room + refund creator
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.garmondrop_cancel_waiting_atomic(
  p_room_id uuid,
  p_user_id uuid,
  p_reference text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.garmondrop_rooms%ROWTYPE;
  v_amt int;
  v_now timestamptz := now();
BEGIN
  IF p_room_id IS NULL OR p_user_id IS NULL OR p_reference IS NULL OR trim(p_reference) = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid arguments');
  END IF;

  IF EXISTS (SELECT 1 FROM public.coin_transactions WHERE reference = p_reference) THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true);
  END IF;

  SELECT * INTO v_room FROM public.garmondrop_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Room not found');
  END IF;

  IF v_room.status <> 'waiting' OR v_room.opponent_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Room cannot be cancelled');
  END IF;

  IF v_room.creator_id <> p_user_id THEN
    RETURN jsonb_build_object('success', false, 'message', 'Only the host can cancel');
  END IF;

  v_amt := v_room.entry_amount_minor;

  UPDATE public.users SET gpay_coins = gpay_coins + v_amt WHERE id = p_user_id;

  INSERT INTO public.coin_transactions (
    user_id, type, gold_coins, gpay_coins, description, reference
  ) VALUES (
    p_user_id, 'garmondrop_refund', 0, v_amt,
    'GarmonDrop cancel waiting room', p_reference
  );

  UPDATE public.garmondrop_rooms
  SET status = 'cancelled', updated_at = v_now, completed_at = v_now
  WHERE id = p_room_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.garmondrop_cancel_waiting_atomic(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.garmondrop_cancel_waiting_atomic(uuid, uuid, text) TO service_role;

COMMENT ON TABLE public.garmondrop_rooms IS 'PvP Connect Four (GarmonDrop); GPC pot, 10% platform fee on settlement.';

-- Realtime
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'garmondrop_rooms'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.garmondrop_rooms;
    END IF;
  END IF;
END $$;

ALTER TABLE public.garmondrop_rooms REPLICA IDENTITY FULL;

-- === from 20260610120000_garmondrop_fix_null_current_turn.sql (source) ===

-- Repair active games where both players are seated but current_turn was never set (stuck: no moves, Forfeit only).

CREATE OR REPLACE FUNCTION public.garmondrop_fix_null_current_turn(p_room_id uuid, p_now timestamptz)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.garmondrop_rooms
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

REVOKE ALL ON FUNCTION public.garmondrop_fix_null_current_turn(uuid, timestamptz) FROM PUBLIC;

-- Backfill existing broken rows
UPDATE public.garmondrop_rooms
SET
  current_turn = CASE
    WHEN mod(move_seq, 2) = 0 THEN creator_id
    ELSE opponent_id
  END,
  updated_at = now()
WHERE status = 'active'
  AND opponent_id IS NOT NULL
  AND current_turn IS NULL;

CREATE OR REPLACE FUNCTION public.garmondrop_repair_turn_atomic(p_room_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.garmondrop_rooms%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  IF p_room_id IS NULL OR p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'room and user required');
  END IF;

  SELECT * INTO v_room FROM public.garmondrop_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Room not found');
  END IF;

  IF p_user_id <> v_room.creator_id AND p_user_id <> v_room.opponent_id THEN
    RETURN jsonb_build_object('success', false, 'message', 'Not a player in this room');
  END IF;

  PERFORM public.garmondrop_fix_null_current_turn(p_room_id, v_now);
  SELECT * INTO v_room FROM public.garmondrop_rooms WHERE id = p_room_id;

  RETURN jsonb_build_object('success', true, 'room', row_to_json(v_room)::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.garmondrop_repair_turn_atomic(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.garmondrop_repair_turn_atomic(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.garmondrop_make_move_atomic(
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
  v_room public.garmondrop_rooms%ROWTYPE;
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

  IF EXISTS (SELECT 1 FROM public.garmondrop_moves WHERE reference = p_reference) THEN
    SELECT * INTO v_room FROM public.garmondrop_rooms WHERE id = p_room_id;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'room', row_to_json(v_room)::jsonb
      );
    END IF;
    RETURN jsonb_build_object('success', false, 'message', 'Duplicate reference');
  END IF;

  SELECT * INTO v_room FROM public.garmondrop_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Room not found');
  END IF;

  PERFORM public.garmondrop_fix_null_current_turn(p_room_id, v_now);
  SELECT * INTO v_room FROM public.garmondrop_rooms WHERE id = p_room_id;

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
    IF public.garmondrop_cell(v_board, rloop, vc) = 0 THEN
      vr := rloop;
      EXIT;
    END IF;
  END LOOP;

  IF vr < 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Column is full');
  END IF;

  v_board := jsonb_set(v_board, ARRAY[vr::text, vc::text], to_jsonb(v_piece), true);
  v_won := public.garmondrop_has_winner(v_board, vr, vc, v_piece);
  v_full := public.garmondrop_board_full(v_board);

  INSERT INTO public.garmondrop_moves (room_id, move_seq, user_id, col, row, reference)
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
      v_winner, 'garmondrop_win', 0, v_winner_payout,
      'GarmonDrop win payout', 'garmondrop_win_' || p_room_id::text
    );

    PERFORM public.garmondrop_record_platform_fee(
      p_room_id,
      v_fee,
      v_winner,
      'garmondrop_fee_' || p_room_id::text
    );

    UPDATE public.garmondrop_rooms
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

    SELECT * INTO v_room FROM public.garmondrop_rooms WHERE id = p_room_id;
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
      (v_room.creator_id, 'garmondrop_draw_refund', 0, v_refund_a,
       'GarmonDrop draw refund', 'garmondrop_draw_' || p_room_id::text || '_a'),
      (v_room.opponent_id, 'garmondrop_draw_refund', 0, v_refund_b,
       'GarmonDrop draw refund', 'garmondrop_draw_' || p_room_id::text || '_b');

    PERFORM public.garmondrop_record_platform_fee(
      p_room_id,
      v_fee,
      v_room.creator_id,
      'garmondrop_fee_' || p_room_id::text
    );

    UPDATE public.garmondrop_rooms
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

    SELECT * INTO v_room FROM public.garmondrop_rooms WHERE id = p_room_id;
    RETURN jsonb_build_object(
      'success', true,
      'outcome', 'draw',
      'room', row_to_json(v_room)::jsonb
    );
  END IF;

  v_other := CASE WHEN p_user_id = v_room.creator_id THEN v_room.opponent_id ELSE v_room.creator_id END;

  UPDATE public.garmondrop_rooms
  SET
    board_state = v_board,
    current_turn = v_other,
    move_seq = p_expected_seq + 1,
    updated_at = v_now
  WHERE id = p_room_id;

  SELECT * INTO v_room FROM public.garmondrop_rooms WHERE id = p_room_id;
  RETURN jsonb_build_object(
    'success', true,
    'outcome', 'continue',
    'room', row_to_json(v_room)::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.garmondrop_make_move_atomic(uuid, uuid, integer, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.garmondrop_make_move_atomic(uuid, uuid, integer, integer, text) TO service_role;

-- === from 20260611100000_garmondrop_rls_and_cancel.sql (source) ===

-- GarmonDrop: lock direct table writes and add secure cancel RPC.

CREATE OR REPLACE FUNCTION public.garmondrop_cancel_room(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_room public.garmondrop_rooms%ROWTYPE;
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
  FROM public.garmondrop_rooms
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
  v_ref := 'garmondrop_cancel_' || p_room_id::text;

  UPDATE public.users
  SET gpay_coins = gpay_coins + v_amt
  WHERE id = v_uid;

  INSERT INTO public.coin_transactions (
    user_id, type, gold_coins, gpay_coins, description, reference
  ) VALUES (
    v_uid, 'garmondrop_refund', 0, v_amt,
    'GarmonDrop cancel waiting room', v_ref
  );

  UPDATE public.garmondrop_rooms
  SET status = 'cancelled', updated_at = v_now, completed_at = v_now
  WHERE id = p_room_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.garmondrop_cancel_room(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.garmondrop_cancel_room(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.garmondrop_cancel_room(uuid) TO service_role;

DROP POLICY IF EXISTS "garmondrop_rooms_insert_deny_all" ON public.garmondrop_rooms;
CREATE POLICY "garmondrop_rooms_insert_deny_all"
  ON public.garmondrop_rooms FOR INSERT TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "garmondrop_rooms_update_deny_all" ON public.garmondrop_rooms;
CREATE POLICY "garmondrop_rooms_update_deny_all"
  ON public.garmondrop_rooms FOR UPDATE TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "garmondrop_rooms_delete_deny_all" ON public.garmondrop_rooms;
CREATE POLICY "garmondrop_rooms_delete_deny_all"
  ON public.garmondrop_rooms FOR DELETE TO authenticated
  USING (false);

-- === from 20260613120000_fix_platform_fee_idempotency_on_conflict.sql ===

-- platform_earnings.idempotency_key uses a partial unique INDEX (WHERE idempotency_key IS NOT NULL),
-- not a table UNIQUE constraint. Bare ON CONFLICT (idempotency_key) raises 42P10 and breaks
-- GarmonDrop / Coin Flip / C-Lo settlement when recording platform fees.

CREATE OR REPLACE FUNCTION public.garmondrop_record_platform_fee(
  p_room_id uuid,
  p_amount_gpc integer,
  p_context_user_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount integer := GREATEST(0, COALESCE(p_amount_gpc, 0));
  v_key text := NULLIF(trim(COALESCE(p_idempotency_key, '')), '');
  v_inserted_id uuid;
BEGIN
  IF v_amount <= 0 THEN
    RETURN jsonb_build_object('inserted', false, 'reason', 'non_positive_amount');
  END IF;
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('inserted', false, 'reason', 'room_id_required');
  END IF;
  IF v_key IS NULL THEN
    RETURN jsonb_build_object('inserted', false, 'reason', 'idempotency_key_required');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.platform_earnings pe WHERE pe.idempotency_key = v_key
  ) THEN
    RETURN jsonb_build_object('inserted', false, 'reason', 'duplicate_or_conflict');
  END IF;

  BEGIN
    INSERT INTO public.platform_earnings (
      source,
      source_id,
      amount_cents,
      description,
      user_id,
      idempotency_key
    )
    VALUES (
      'garmondrop_platform_fee',
      p_room_id::text,
      v_amount,
      'GarmonDrop PvP platform fee (10% of pot)',
      p_context_user_id,
      v_key
    )
    RETURNING id INTO v_inserted_id;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('inserted', false, 'reason', 'duplicate_or_conflict');
  END;

  PERFORM public.platform_record_revenue(v_amount::bigint, 'garmondrop_fee');

  RETURN jsonb_build_object('inserted', true, 'id', v_inserted_id, 'idempotency_key', v_key);
END;
$$;

CREATE OR REPLACE FUNCTION public.coin_flip_record_platform_fee(
  p_game_id uuid,
  p_amount_gpc integer,
  p_winner_user_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount integer := GREATEST(0, COALESCE(p_amount_gpc, 0));
  v_key text := NULLIF(trim(COALESCE(p_idempotency_key, '')), '');
  v_inserted_id uuid;
BEGIN
  IF v_amount <= 0 THEN
    RETURN jsonb_build_object('inserted', false, 'reason', 'non_positive_amount');
  END IF;
  IF p_game_id IS NULL THEN
    RETURN jsonb_build_object('inserted', false, 'reason', 'game_id_required');
  END IF;
  IF v_key IS NULL THEN
    RETURN jsonb_build_object('inserted', false, 'reason', 'idempotency_key_required');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.platform_earnings pe WHERE pe.idempotency_key = v_key
  ) THEN
    RETURN jsonb_build_object('inserted', false, 'reason', 'duplicate_or_conflict');
  END IF;

  BEGIN
    INSERT INTO public.platform_earnings (
      source,
      source_id,
      amount_cents,
      description,
      user_id,
      idempotency_key
    )
    VALUES (
      'coinflip_platform_fee',
      p_game_id::text,
      v_amount,
      'Coin Flip PvP platform fee (10% of pot)',
      p_winner_user_id,
      v_key
    )
    RETURNING id INTO v_inserted_id;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('inserted', false, 'reason', 'duplicate_or_conflict');
  END;

  PERFORM public.platform_record_revenue(v_amount::bigint, 'coinflip_fee');

  RETURN jsonb_build_object('inserted', true, 'id', v_inserted_id, 'idempotency_key', v_key);
END;
$$;

CREATE OR REPLACE FUNCTION public.celo_record_platform_fee(
  p_round_id uuid,
  p_fee_type text,
  p_amount_cents integer,
  p_description text,
  p_user_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount integer := GREATEST(0, COALESCE(p_amount_cents, 0));
  v_fee_type text := COALESCE(NULLIF(trim(p_fee_type), ''), 'celo_main_fee');
  v_desc text := COALESCE(NULLIF(trim(p_description), ''), 'C-Lo platform fee');
  v_key text := COALESCE(
    NULLIF(trim(p_idempotency_key), ''),
    CASE
      WHEN p_round_id IS NULL THEN NULL
      ELSE 'celo_fee:' || p_round_id::text || ':' || v_fee_type
    END
  );
  v_inserted_id uuid;
BEGIN
  IF v_amount <= 0 THEN
    RETURN jsonb_build_object('inserted', false, 'reason', 'non_positive_amount');
  END IF;
  IF v_key IS NULL THEN
    RETURN jsonb_build_object('inserted', false, 'reason', 'idempotency_key_required');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.platform_earnings pe WHERE pe.idempotency_key = v_key
  ) THEN
    RETURN jsonb_build_object('inserted', false, 'idempotency_key', v_key);
  END IF;

  BEGIN
    INSERT INTO public.platform_earnings (
      source,
      source_id,
      amount_cents,
      description,
      user_id,
      round_id,
      fee_type,
      idempotency_key
    )
    VALUES (
      'celo_game',
      CASE WHEN p_round_id IS NULL THEN NULL ELSE p_round_id::text END,
      v_amount,
      v_desc,
      p_user_id,
      p_round_id,
      v_fee_type,
      v_key
    )
    RETURNING id INTO v_inserted_id;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('inserted', false, 'idempotency_key', v_key);
  END;

  PERFORM public.platform_record_revenue(v_amount, 'celo_fee');

  RETURN jsonb_build_object('inserted', true, 'id', v_inserted_id, 'idempotency_key', v_key);
END;
$$;

-- Repair helpers missing on some deployed DBs (from 20260610120000).
CREATE OR REPLACE FUNCTION public.garmondrop_fix_null_current_turn(p_room_id uuid, p_now timestamptz)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.garmondrop_rooms
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

REVOKE ALL ON FUNCTION public.garmondrop_fix_null_current_turn(uuid, timestamptz) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.garmondrop_repair_turn_atomic(p_room_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.garmondrop_rooms%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  IF p_room_id IS NULL OR p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'room and user required');
  END IF;

  SELECT * INTO v_room FROM public.garmondrop_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Room not found');
  END IF;

  IF p_user_id <> v_room.creator_id AND p_user_id <> v_room.opponent_id THEN
    RETURN jsonb_build_object('success', false, 'message', 'Not a player in this room');
  END IF;

  PERFORM public.garmondrop_fix_null_current_turn(p_room_id, v_now);
  SELECT * INTO v_room FROM public.garmondrop_rooms WHERE id = p_room_id;

  RETURN jsonb_build_object('success', true, 'room', row_to_json(v_room)::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.garmondrop_repair_turn_atomic(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.garmondrop_repair_turn_atomic(uuid, uuid) TO service_role;

-- make_move: auto-repair null current_turn before validating turn order.
CREATE OR REPLACE FUNCTION public.garmondrop_make_move_atomic(
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
  v_room public.garmondrop_rooms%ROWTYPE;
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

  IF EXISTS (SELECT 1 FROM public.garmondrop_moves WHERE reference = p_reference) THEN
    SELECT * INTO v_room FROM public.garmondrop_rooms WHERE id = p_room_id;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'room', row_to_json(v_room)::jsonb
      );
    END IF;
    RETURN jsonb_build_object('success', false, 'message', 'Duplicate reference');
  END IF;

  SELECT * INTO v_room FROM public.garmondrop_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Room not found');
  END IF;

  PERFORM public.garmondrop_fix_null_current_turn(p_room_id, v_now);
  SELECT * INTO v_room FROM public.garmondrop_rooms WHERE id = p_room_id;

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
    IF public.garmondrop_cell(v_board, rloop, vc) = 0 THEN
      vr := rloop;
      EXIT;
    END IF;
  END LOOP;

  IF vr < 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Column is full');
  END IF;

  v_board := jsonb_set(v_board, ARRAY[vr::text, vc::text], to_jsonb(v_piece), true);
  v_won := public.garmondrop_has_winner(v_board, vr, vc, v_piece);
  v_full := public.garmondrop_board_full(v_board);

  INSERT INTO public.garmondrop_moves (room_id, move_seq, user_id, col, row, reference)
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
      v_winner, 'garmondrop_win', 0, v_winner_payout,
      'GarmonDrop win payout', 'garmondrop_win_' || p_room_id::text
    );

    PERFORM public.garmondrop_record_platform_fee(
      p_room_id,
      v_fee,
      v_winner,
      'garmondrop_fee_' || p_room_id::text
    );

    UPDATE public.garmondrop_rooms
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

    SELECT * INTO v_room FROM public.garmondrop_rooms WHERE id = p_room_id;
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
      (v_room.creator_id, 'garmondrop_draw_refund', 0, v_refund_a,
       'GarmonDrop draw refund', 'garmondrop_draw_' || p_room_id::text || '_a'),
      (v_room.opponent_id, 'garmondrop_draw_refund', 0, v_refund_b,
       'GarmonDrop draw refund', 'garmondrop_draw_' || p_room_id::text || '_b');

    PERFORM public.garmondrop_record_platform_fee(
      p_room_id,
      v_fee,
      v_room.creator_id,
      'garmondrop_fee_' || p_room_id::text
    );

    UPDATE public.garmondrop_rooms
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

    SELECT * INTO v_room FROM public.garmondrop_rooms WHERE id = p_room_id;
    RETURN jsonb_build_object(
      'success', true,
      'outcome', 'draw',
      'room', row_to_json(v_room)::jsonb
    );
  END IF;

  v_other := CASE WHEN p_user_id = v_room.creator_id THEN v_room.opponent_id ELSE v_room.creator_id END;

  UPDATE public.garmondrop_rooms
  SET
    board_state = v_board,
    current_turn = v_other,
    move_seq = p_expected_seq + 1,
    updated_at = v_now
  WHERE id = p_room_id;

  SELECT * INTO v_room FROM public.garmondrop_rooms WHERE id = p_room_id;
  RETURN jsonb_build_object(
    'success', true,
    'outcome', 'continue',
    'room', row_to_json(v_room)::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.garmondrop_make_move_atomic(uuid, uuid, integer, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.garmondrop_make_move_atomic(uuid, uuid, integer, integer, text) TO service_role;
