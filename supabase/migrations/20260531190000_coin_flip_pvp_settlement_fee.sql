-- PvP Coin Flip settlement columns + idempotent platform fee (platform_earnings + platform_balance).

ALTER TABLE public.coin_flip_games
  ADD COLUMN IF NOT EXISTS total_pot_minor bigint,
  ADD COLUMN IF NOT EXISTS winner_payout_minor bigint,
  ADD COLUMN IF NOT EXISTS loser_user_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS settled_at timestamptz;

COMMENT ON COLUMN public.coin_flip_games.house_cut_minor IS 'Platform fee (10% of total pot) in GPC minor units.';
COMMENT ON COLUMN public.coin_flip_games.total_pot_minor IS 'Both players stakes: 2 × per-player bet.';
COMMENT ON COLUMN public.coin_flip_games.winner_payout_minor IS 'Net credited to winner: total_pot_minor − house_cut_minor.';

-- Idempotent fee line + atomic platform_balance bump (same pattern as celo_record_platform_fee).
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
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NULL THEN
    RETURN jsonb_build_object('inserted', false, 'reason', 'duplicate_or_conflict');
  END IF;

  PERFORM public.platform_record_revenue(v_amount::bigint, 'coinflip_fee');

  RETURN jsonb_build_object('inserted', true, 'id', v_inserted_id, 'idempotency_key', v_key);
END;
$$;

COMMENT ON FUNCTION public.coin_flip_record_platform_fee(uuid, integer, uuid, text)
  IS 'Records Coin Flip PvP fee idempotently; credits platform_balance via platform_record_revenue.';

GRANT EXECUTE ON FUNCTION public.coin_flip_record_platform_fee(uuid, integer, uuid, text) TO service_role;
