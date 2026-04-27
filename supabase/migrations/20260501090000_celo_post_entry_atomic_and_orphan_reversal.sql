-- Atomic C-Lo post-entry: debit users.gpay_coins + coin_transactions + celo_room_players update.
-- Also add reversal metadata to coin_transactions for orphaned-debit cleanup.

ALTER TABLE public.coin_transactions
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz;

ALTER TABLE public.coin_transactions
  ADD COLUMN IF NOT EXISTS reversal_reference text;

CREATE INDEX IF NOT EXISTS coin_transactions_reversed_at_idx
  ON public.coin_transactions (reversed_at);

CREATE OR REPLACE FUNCTION public.celo_post_entry_atomic(
  p_room_id uuid,
  p_user_id uuid,
  p_amount integer,
  p_reference text,
  p_description text DEFAULT 'C-Lo table entry',
  p_ledger_type text DEFAULT 'celo_entry'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.celo_rooms%ROWTYPE;
  v_player public.celo_room_players%ROWTYPE;
  v_now timestamptz := now();
  v_status text;
  v_desc text := COALESCE(NULLIF(trim(p_description), ''), 'C-Lo table entry');
  v_type text := COALESCE(NULLIF(trim(p_ledger_type), ''), 'celo_entry');
BEGIN
  IF p_room_id IS NULL OR p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'room_id and user_id required');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'amount must be positive');
  END IF;
  IF p_reference IS NULL OR trim(p_reference) = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'reference required');
  END IF;

  IF EXISTS (SELECT 1 FROM public.coin_transactions WHERE reference = p_reference) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Duplicate transaction');
  END IF;

  SELECT *
  INTO v_room
  FROM public.celo_rooms
  WHERE id = p_room_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Room not found');
  END IF;

  v_status := trim(COALESCE(v_room.status, ''));
  IF v_status = 'rolling' OR v_status = 'completed' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Cannot post entry for this room state');
  END IF;
  IF v_status <> ALL (ARRAY['waiting', 'active', 'entry_phase']) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Entries cannot be posted in this room state');
  END IF;

  IF v_room.banker_id IS NOT NULL AND v_room.banker_id = p_user_id THEN
    RETURN jsonb_build_object('success', false, 'message', 'The banker cannot post a player entry');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.celo_rounds r
    WHERE r.room_id = p_room_id
      AND r.status IN ('banker_rolling', 'player_rolling', 'betting')
    LIMIT 1
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'A round is already in progress');
  END IF;

  SELECT *
  INTO v_player
  FROM public.celo_room_players
  WHERE room_id = p_room_id
    AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'You are not seated at this table');
  END IF;

  IF lower(trim(COALESCE(v_player.role, ''))) <> 'player' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Only players in a player seat can post an entry');
  END IF;

  IF v_player.entry_posted IS TRUE
     OR COALESCE(v_player.stake_amount_sc, 0) > 0
     OR COALESCE(v_player.entry_sc, 0) > 0
     OR COALESCE(v_player.bet_cents, 0) > 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'You already posted an entry for this round');
  END IF;

  UPDATE public.users u
  SET gpay_coins = u.gpay_coins - p_amount
  WHERE u.id = p_user_id
    AND u.gpay_coins >= p_amount;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Insufficient GPay Coins for this entry');
  END IF;

  INSERT INTO public.coin_transactions (
    user_id,
    type,
    gold_coins,
    gpay_coins,
    description,
    reference
  )
  VALUES (
    p_user_id,
    v_type,
    0,
    -p_amount,
    v_desc,
    p_reference
  );

  UPDATE public.celo_room_players
  SET
    entry_sc = p_amount,
    bet_cents = p_amount,
    entry_posted = true,
    stake_amount_sc = p_amount,
    status = 'active',
    player_seat_status = 'active'
  WHERE room_id = p_room_id
    AND user_id = p_user_id;

  IF v_status IN ('waiting', 'entry_phase') THEN
    UPDATE public.celo_rooms
    SET
      status = CASE WHEN v_status = 'waiting' THEN 'active' ELSE 'entry_phase' END,
      last_activity = v_now
    WHERE id = p_room_id;
  ELSE
    UPDATE public.celo_rooms
    SET last_activity = v_now
    WHERE id = p_room_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION public.celo_post_entry_atomic(uuid, uuid, integer, text, text, text)
  IS 'Atomically debits GPC, inserts coin_transactions, and marks celo_room_players as posted entry.';

GRANT EXECUTE ON FUNCTION public.celo_post_entry_atomic(uuid, uuid, integer, text, text, text) TO service_role;
