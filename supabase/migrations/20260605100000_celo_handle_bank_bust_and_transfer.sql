-- Atomic bank-bust + banker succession: celo_room_players and celo_rooms in one transaction.
-- Replaces multi-step client updates that could leave banker_id out of sync with role rows.

CREATE OR REPLACE FUNCTION public.celo_next_free_player_seat(p_room_id uuid, p_cap integer)
RETURNS integer
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  cap integer := GREATEST(2, LEAST(99, COALESCE(NULLIF(p_cap, 0), 10)));
  s integer;
BEGIN
  FOR s IN 1..(cap - 1) LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.celo_room_players crp
      WHERE crp.room_id = p_room_id
        AND crp.seat_number IS NOT NULL
        AND crp.seat_number = s
    ) THEN
      RETURN s;
    END IF;
  END LOOP;
  RETURN 1;
END;
$$;

COMMENT ON FUNCTION public.celo_next_free_player_seat(uuid, integer) IS
  'Lowest free player seat in 1..cap-1 (banker uses seat 0). Matches TS nextAvailablePlayerSeat.';

CREATE OR REPLACE FUNCTION public.celo_handle_bank_bust_and_transfer(
  p_room_id uuid,
  p_winner_user_id uuid,
  p_max_players integer,
  p_action text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev uuid;
  v_room_max integer;
  v_cap integer;
  v_effective_winner uuid;
  v_out_banker uuid;
  r RECORD;
  v_seat integer;
BEGIN
  IF p_room_id IS NULL THEN
    RAISE EXCEPTION 'celo_handle_bank_bust_and_transfer: p_room_id required';
  END IF;

  SELECT c.banker_id, c.max_players
  INTO v_prev, v_room_max
  FROM public.celo_rooms AS c
  WHERE c.id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'celo_handle_bank_bust_and_transfer: room not found %', p_room_id;
  END IF;

  v_cap := GREATEST(2, LEAST(99, COALESCE(NULLIF(p_max_players, 0), v_room_max, 10)));

  -- No room-level banker: zero bank + bust flag only (matches legacy TS branch).
  IF v_prev IS NULL THEN
    FOR r IN
      SELECT crp.user_id
      FROM public.celo_room_players AS crp
      WHERE crp.room_id = p_room_id
        AND crp.role = 'banker'
      ORDER BY crp.user_id
    LOOP
      v_seat := public.celo_next_free_player_seat(p_room_id, v_cap);
      UPDATE public.celo_room_players AS u
      SET
        role = 'player',
        seat_number = v_seat
      WHERE u.room_id = p_room_id
        AND u.user_id = r.user_id;
    END LOOP;

    UPDATE public.celo_rooms AS c
    SET
      current_bank_sc = 0,
      current_bank_cents = 0,
      banker_reserve_sc = 0,
      bank_busted = true,
      last_activity = now()
    WHERE c.id = p_room_id;

    RETURN jsonb_build_object(
      'success', true,
      'banker_id', 'null'::jsonb,
      'action', to_jsonb(COALESCE(p_action, ''))
    );
  END IF;

  v_effective_winner := NULL;
  IF p_winner_user_id IS NOT NULL
     AND p_winner_user_id IS DISTINCT FROM v_prev THEN
    v_effective_winner := p_winner_user_id;
  END IF;

  v_out_banker := NULL;

  IF v_effective_winner IS NOT NULL THEN
    -- Demote every banker row except the successor.
    FOR r IN
      SELECT crp.user_id
      FROM public.celo_room_players AS crp
      WHERE crp.room_id = p_room_id
        AND crp.role = 'banker'
        AND crp.user_id IS DISTINCT FROM v_effective_winner
      ORDER BY crp.user_id
    LOOP
      v_seat := public.celo_next_free_player_seat(p_room_id, v_cap);
      UPDATE public.celo_room_players AS u
      SET
        role = 'player',
        seat_number = v_seat
      WHERE u.room_id = p_room_id
        AND u.user_id = r.user_id;
    END LOOP;

    INSERT INTO public.celo_room_players (
      room_id,
      user_id,
      role,
      seat_number,
      bet_cents,
      entry_sc,
      stake_amount_sc,
      entry_posted,
      status,
      player_seat_status,
      joined_at
    )
    VALUES (
      p_room_id,
      v_effective_winner,
      'banker',
      0,
      0,
      0,
      0,
      false,
      'seated',
      'seated',
      now()
    )
    ON CONFLICT (room_id, user_id) DO UPDATE SET
      role = EXCLUDED.role,
      seat_number = 0,
      bet_cents = 0,
      entry_sc = 0,
      stake_amount_sc = 0,
      entry_posted = false,
      status = 'seated',
      player_seat_status = 'seated';

    UPDATE public.celo_rooms AS c
    SET
      banker_id = v_effective_winner,
      current_bank_sc = 0,
      current_bank_cents = 0,
      banker_reserve_sc = 0,
      bank_busted = true,
      status = 'bank_takeover',
      last_activity = now()
    WHERE c.id = p_room_id;

    v_out_banker := v_effective_winner;
  ELSE
    -- Had a banker but no valid successor: clear room banker and demote all banker rows.
    FOR r IN
      SELECT crp.user_id
      FROM public.celo_room_players AS crp
      WHERE crp.room_id = p_room_id
        AND crp.role = 'banker'
      ORDER BY crp.user_id
    LOOP
      v_seat := public.celo_next_free_player_seat(p_room_id, v_cap);
      UPDATE public.celo_room_players AS u
      SET
        role = 'player',
        seat_number = v_seat
      WHERE u.room_id = p_room_id
        AND u.user_id = r.user_id;
    END LOOP;

    UPDATE public.celo_rooms AS c
    SET
      banker_id = NULL,
      current_bank_sc = 0,
      current_bank_cents = 0,
      banker_reserve_sc = 0,
      bank_busted = true,
      last_activity = now()
    WHERE c.id = p_room_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'banker_id', CASE
      WHEN v_out_banker IS NULL THEN 'null'::jsonb
      ELSE to_jsonb(v_out_banker::text)
    END,
    'action', to_jsonb(COALESCE(p_action, ''))
  );
END;
$$;

COMMENT ON FUNCTION public.celo_handle_bank_bust_and_transfer(uuid, uuid, integer, text) IS
  'Atomically handles bank bust: demote/promote celo_room_players and sync celo_rooms.banker_id and bank fields.';

GRANT EXECUTE ON FUNCTION public.celo_handle_bank_bust_and_transfer(uuid, uuid, integer, text) TO service_role;
