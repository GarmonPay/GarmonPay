-- Coin Flip (GPay only): games table + ledger event types game_play / game_win

-- ========== Extend gpay_ledger event types ==========
ALTER TABLE public.gpay_ledger DROP CONSTRAINT IF EXISTS gpay_ledger_event_type_check;
ALTER TABLE public.gpay_ledger ADD CONSTRAINT gpay_ledger_event_type_check CHECK (event_type IN (
  'reward_earn', 'referral_reward', 'game_reward', 'ad_reward',
  'manual_credit', 'manual_debit', 'admin_adjustment',
  'claim_reserve', 'claim_release', 'claim_settle',
  'game_play', 'game_win'
));

-- ========== coin_flip_games ==========
CREATE TABLE IF NOT EXISTS public.coin_flip_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  mode text NOT NULL CHECK (mode IN ('vs_house', 'vs_player')),
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'completed', 'cancelled')),
  bet_amount_minor bigint NOT NULL CHECK (bet_amount_minor >= 10),
  house_cut_minor bigint NOT NULL DEFAULT 0 CHECK (house_cut_minor >= 0),
  creator_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  creator_side text NOT NULL CHECK (creator_side IN ('heads', 'tails')),
  opponent_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  winner_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  result text CHECK (result IS NULL OR result IN ('heads', 'tails')),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS coin_flip_games_creator_created ON public.coin_flip_games (creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS coin_flip_games_status_mode ON public.coin_flip_games (status, mode);
CREATE INDEX IF NOT EXISTS coin_flip_games_resolved_at ON public.coin_flip_games (resolved_at DESC);

COMMENT ON TABLE public.coin_flip_games IS 'GPay-only coin flip; ledger uses game_play (debit, negative amount) and game_win (credit).';

ALTER TABLE public.coin_flip_games ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own coin_flip_games" ON public.coin_flip_games;
CREATE POLICY "Users read own coin_flip_games"
  ON public.coin_flip_games FOR SELECT
  USING (auth.uid() = creator_id OR auth.uid() = opponent_id);

DROP POLICY IF EXISTS "Service role full access coin_flip_games" ON public.coin_flip_games;
CREATE POLICY "Service role full access coin_flip_games"
  ON public.coin_flip_games FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ========== gpay_ledger_entry: add game_play, game_win ==========
CREATE OR REPLACE FUNCTION public.gpay_ledger_entry(
  p_user_id uuid,
  p_event_type text,
  p_amount_minor bigint,
  p_reference text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_valid_types text[] := ARRAY[
    'reward_earn', 'referral_reward', 'game_reward', 'ad_reward',
    'manual_credit', 'manual_debit', 'admin_adjustment',
    'claim_reserve', 'claim_release', 'claim_settle',
    'game_play', 'game_win'
  ];
  d_avail bigint := 0;
  d_pend bigint := 0;
  d_claimed bigint := 0;
  d_life bigint := 0;
  v_avail bigint;
  v_pend bigint;
  v_claimed bigint;
  v_life bigint;
  av_new bigint;
  pend_new bigint;
  claimed_new bigint;
  life_new bigint;
  v_ledger_id uuid;
  v_ref text := nullif(trim(COALESCE(p_reference, '')), '');
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'user_id required');
  END IF;
  IF p_event_type IS NULL OR NOT (p_event_type = ANY (v_valid_types)) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid event_type');
  END IF;

  IF v_ref IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.gpay_ledger WHERE reference = v_ref) THEN
      RETURN jsonb_build_object('success', false, 'message', 'Duplicate transaction');
    END IF;
  END IF;

  IF p_event_type IN ('reward_earn', 'referral_reward', 'game_reward', 'ad_reward', 'manual_credit', 'game_win') THEN
    IF p_amount_minor IS NULL OR p_amount_minor <= 0 THEN
      RETURN jsonb_build_object('success', false, 'message', 'Amount must be positive');
    END IF;
    d_avail := p_amount_minor;
    d_life := p_amount_minor;
  ELSIF p_event_type IN ('manual_debit', 'game_play') THEN
    IF p_amount_minor IS NULL OR p_amount_minor >= 0 THEN
      RETURN jsonb_build_object('success', false, 'message', 'Debit requires negative amount_minor');
    END IF;
    d_avail := p_amount_minor;
  ELSIF p_event_type = 'admin_adjustment' THEN
    IF p_amount_minor IS NULL OR p_amount_minor = 0 THEN
      RETURN jsonb_build_object('success', false, 'message', 'admin_adjustment amount must be non-zero');
    END IF;
    d_avail := p_amount_minor;
    IF p_amount_minor > 0 THEN
      d_life := p_amount_minor;
    END IF;
  ELSIF p_event_type IN ('claim_reserve', 'claim_release', 'claim_settle') THEN
    IF p_amount_minor IS NULL OR p_amount_minor <= 0 THEN
      RETURN jsonb_build_object('success', false, 'message', 'claim amount must be positive');
    END IF;
    IF p_event_type = 'claim_reserve' THEN
      d_avail := -p_amount_minor;
      d_pend := p_amount_minor;
    ELSIF p_event_type = 'claim_release' THEN
      d_avail := p_amount_minor;
      d_pend := -p_amount_minor;
    ELSE
      d_pend := -p_amount_minor;
      d_claimed := p_amount_minor;
    END IF;
  END IF;

  INSERT INTO public.gpay_balances (user_id, updated_at)
  VALUES (p_user_id, now())
  ON CONFLICT (user_id) DO NOTHING;

  SELECT available_minor, pending_claim_minor, claimed_lifetime_minor, lifetime_earned_minor
  INTO v_avail, v_pend, v_claimed, v_life
  FROM public.gpay_balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_avail IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'GPay balance row not found');
  END IF;

  av_new := v_avail + d_avail;
  pend_new := v_pend + d_pend;
  claimed_new := v_claimed + d_claimed;
  life_new := v_life + d_life;

  IF av_new < 0 OR pend_new < 0 OR claimed_new < 0 OR life_new < 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Insufficient balance or invalid state');
  END IF;

  INSERT INTO public.gpay_ledger (
    user_id,
    event_type,
    amount_minor,
    delta_available_minor,
    delta_pending_claim_minor,
    delta_claimed_lifetime_minor,
    delta_lifetime_earned_minor,
    available_after_minor,
    pending_claim_after_minor,
    claimed_lifetime_after_minor,
    lifetime_earned_after_minor,
    reference,
    metadata
  ) VALUES (
    p_user_id,
    p_event_type,
    p_amount_minor,
    d_avail,
    d_pend,
    d_claimed,
    d_life,
    av_new,
    pend_new,
    claimed_new,
    life_new,
    v_ref,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_ledger_id;

  UPDATE public.gpay_balances
  SET
    available_minor = av_new,
    pending_claim_minor = pend_new,
    claimed_lifetime_minor = claimed_new,
    lifetime_earned_minor = life_new,
    updated_at = now()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'ledger_id', v_ledger_id,
    'available_minor', av_new,
    'pending_claim_minor', pend_new,
    'claimed_lifetime_minor', claimed_new,
    'lifetime_earned_minor', life_new
  );
END;
$$;

COMMENT ON FUNCTION public.gpay_ledger_entry IS 'Atomic GPay movement. game_play: negative amount (bet). game_win: positive amount (payout).';
