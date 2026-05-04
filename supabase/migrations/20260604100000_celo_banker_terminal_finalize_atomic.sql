-- Atomic banker terminal settlement: finalize celo_rounds + adjust celo_rooms bank in one transaction.
-- Fixes orphan rounds where status completed but room bank was never decremented/incremented.

ALTER TABLE public.celo_rounds
  ADD COLUMN IF NOT EXISTS terminal_bank_delta_sc integer;

ALTER TABLE public.celo_rounds
  ADD COLUMN IF NOT EXISTS terminal_room_bank_applied boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.celo_rounds.terminal_bank_delta_sc IS
  'Signed GPC delta applied to celo_rooms.current_bank_sc for this terminal banker outcome (instant_win / instant_loss).';

COMMENT ON COLUMN public.celo_rounds.terminal_room_bank_applied IS
  'True once terminal_bank_delta_sc has been applied to the room bank (same txn as finalize for new settlements).';

CREATE OR REPLACE FUNCTION public.celo_finalize_banker_terminal_round(
  p_round_id uuid,
  p_room_id uuid,
  p_banker_dice integer[],
  p_banker_dice_name text,
  p_banker_dice_result text,
  p_banker_winnings_sc integer,
  p_platform_fee_sc integer,
  p_bank_delta_sc integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows integer;
  v_new_bank integer;
BEGIN
  IF p_round_id IS NULL OR p_room_id IS NULL THEN
    RETURN jsonb_build_object(
      'finalized', false,
      'reason', 'missing_ids',
      'new_bank_sc', (
        SELECT COALESCE(current_bank_sc, 0)::integer FROM public.celo_rooms WHERE id = p_room_id
      )
    );
  END IF;

  UPDATE public.celo_rounds AS r
  SET
    banker_dice = p_banker_dice,
    banker_dice_name = p_banker_dice_name,
    banker_dice_result = p_banker_dice_result,
    banker_roll_in_flight = false,
    status = 'completed',
    completed_at = now(),
    platform_fee_sc = p_platform_fee_sc,
    banker_winnings_sc = p_banker_winnings_sc,
    terminal_bank_delta_sc = p_bank_delta_sc,
    terminal_room_bank_applied = true
  WHERE r.id = p_round_id
    AND r.status = 'banker_rolling';

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    RETURN jsonb_build_object(
      'finalized', false,
      'reason', 'round_not_banker_rolling',
      'new_bank_sc', (
        SELECT COALESCE(current_bank_sc, 0)::integer FROM public.celo_rooms WHERE id = p_room_id
      )
    );
  END IF;

  UPDATE public.celo_rooms AS c
  SET
    current_bank_sc = GREATEST(
      0,
      COALESCE(c.current_bank_sc, 0) + COALESCE(p_bank_delta_sc, 0)
    ),
    current_bank_cents = GREATEST(
      0,
      COALESCE(c.current_bank_sc, 0) + COALESCE(p_bank_delta_sc, 0)
    )
  WHERE c.id = p_room_id
  RETURNING c.current_bank_sc INTO v_new_bank;

  RETURN jsonb_build_object(
    'finalized', true,
    'reason', 'ok',
    'new_bank_sc', COALESCE(v_new_bank, 0)
  );
END;
$$;

COMMENT ON FUNCTION public.celo_finalize_banker_terminal_round(
  uuid, uuid, integer[], text, text, integer, integer, integer
) IS
  'Atomically completes a banker instant_win/instant_loss round and applies room bank delta. v2 instant_loss uses -sum(stake); banker_winnings_sc remains -sum(net) for P&L display.';

GRANT EXECUTE ON FUNCTION public.celo_finalize_banker_terminal_round(
  uuid, uuid, integer[], text, text, integer, integer, integer
) TO service_role;

-- Repair: apply stored delta when finalize ran without bank (legacy) or reconciliation retry.
CREATE OR REPLACE FUNCTION public.celo_reconcile_terminal_room_bank(p_round_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_delta integer;
  v_new_bank integer;
BEGIN
  IF p_round_id IS NULL THEN
    RETURN jsonb_build_object('reconciled', false, 'reason', 'missing_round_id');
  END IF;

  SELECT
    id,
    room_id,
    status,
    banker_dice_result,
    banker_winnings_sc,
    terminal_bank_delta_sc,
    terminal_room_bank_applied
  INTO r
  FROM public.celo_rounds
  WHERE id = p_round_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('reconciled', false, 'reason', 'round_not_found');
  END IF;

  IF r.status <> 'completed' THEN
    RETURN jsonb_build_object('reconciled', false, 'reason', 'round_not_completed');
  END IF;

  IF r.terminal_room_bank_applied IS TRUE THEN
    RETURN jsonb_build_object(
      'reconciled', false,
      'reason', 'already_applied',
      'new_bank_sc', (
        SELECT COALESCE(current_bank_sc, 0)::integer FROM public.celo_rooms WHERE id = r.room_id
      )
    );
  END IF;

  v_delta := r.terminal_bank_delta_sc;
  IF v_delta IS NULL THEN
    RETURN jsonb_build_object(
      'reconciled', false,
      'reason', 'no_stored_delta_set_terminal_bank_delta_sc_manually'
    );
  END IF;

  IF v_delta = 0 THEN
    UPDATE public.celo_rounds SET terminal_room_bank_applied = true WHERE id = p_round_id;
    RETURN jsonb_build_object(
      'reconciled', true,
      'reason', 'zero_delta_marked',
      'new_bank_sc', (
        SELECT COALESCE(current_bank_sc, 0)::integer FROM public.celo_rooms WHERE id = r.room_id
      )
    );
  END IF;

  UPDATE public.celo_rooms AS c
  SET
    current_bank_sc = GREATEST(0, COALESCE(c.current_bank_sc, 0) + v_delta),
    current_bank_cents = GREATEST(0, COALESCE(c.current_bank_sc, 0) + v_delta)
  WHERE c.id = r.room_id
  RETURNING c.current_bank_sc INTO v_new_bank;

  UPDATE public.celo_rounds
  SET terminal_room_bank_applied = true,
      terminal_bank_delta_sc = COALESCE(terminal_bank_delta_sc, v_delta)
  WHERE id = p_round_id;

  RETURN jsonb_build_object(
    'reconciled', true,
    'reason', 'applied',
    'new_bank_sc', COALESCE(v_new_bank, 0)
  );
END;
$$;

COMMENT ON FUNCTION public.celo_reconcile_terminal_room_bank(uuid) IS
  'Idempotent: applies terminal_bank_delta_sc to celo_rooms if round completed but bank was not updated (retry / legacy orphan).';

GRANT EXECUTE ON FUNCTION public.celo_reconcile_terminal_room_bank(uuid) TO service_role;
