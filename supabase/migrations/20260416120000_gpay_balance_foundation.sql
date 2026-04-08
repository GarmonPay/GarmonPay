-- GPay Balance: internal reward ledger (integer minor units). Independent from wallet_balances / USD.

-- ========== gpay_balances (one row per user) ==========
CREATE TABLE IF NOT EXISTS public.gpay_balances (
  user_id uuid PRIMARY KEY REFERENCES public.users (id) ON DELETE CASCADE,
  available_minor bigint NOT NULL DEFAULT 0 CHECK (available_minor >= 0),
  pending_claim_minor bigint NOT NULL DEFAULT 0 CHECK (pending_claim_minor >= 0),
  claimed_lifetime_minor bigint NOT NULL DEFAULT 0 CHECK (claimed_lifetime_minor >= 0),
  lifetime_earned_minor bigint NOT NULL DEFAULT 0 CHECK (lifetime_earned_minor >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.gpay_balances IS 'Internal GPay reward balances (minor units). Updated only via gpay_ledger_entry RPC. Not USD / not Stripe.';

CREATE INDEX IF NOT EXISTS gpay_balances_updated_at ON public.gpay_balances (updated_at DESC);

-- ========== gpay_ledger (append-only) ==========
CREATE TABLE IF NOT EXISTS public.gpay_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  event_type text NOT NULL,
  amount_minor bigint NOT NULL,
  delta_available_minor bigint NOT NULL DEFAULT 0,
  delta_pending_claim_minor bigint NOT NULL DEFAULT 0,
  delta_claimed_lifetime_minor bigint NOT NULL DEFAULT 0,
  delta_lifetime_earned_minor bigint NOT NULL DEFAULT 0,
  available_after_minor bigint NOT NULL CHECK (available_after_minor >= 0),
  pending_claim_after_minor bigint NOT NULL CHECK (pending_claim_after_minor >= 0),
  claimed_lifetime_after_minor bigint NOT NULL CHECK (claimed_lifetime_after_minor >= 0),
  lifetime_earned_after_minor bigint NOT NULL CHECK (lifetime_earned_after_minor >= 0),
  reference text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gpay_ledger_event_type_check CHECK (event_type IN (
    'reward_earn', 'referral_reward', 'game_reward', 'ad_reward',
    'manual_credit', 'manual_debit', 'admin_adjustment',
    'claim_reserve', 'claim_release', 'claim_settle'
  ))
);

CREATE INDEX IF NOT EXISTS gpay_ledger_user_id_created ON public.gpay_ledger (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS gpay_ledger_event_type ON public.gpay_ledger (event_type);
CREATE UNIQUE INDEX IF NOT EXISTS gpay_ledger_reference_unique
  ON public.gpay_ledger (reference)
  WHERE reference IS NOT NULL AND trim(reference) <> '';

COMMENT ON TABLE public.gpay_ledger IS 'Append-only GPay ledger. amount_minor is the primary signed movement for display; deltas document bucket changes.';

-- ========== gpay_claims (workflow; not wired to routes in this migration) ==========
CREATE TABLE IF NOT EXISTS public.gpay_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  status text NOT NULL DEFAULT 'pending',
  idempotency_key text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  completed_at timestamptz,
  reviewer_id uuid,
  reject_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gpay_claims_status_check CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'cancelled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS gpay_claims_idempotency_key_unique
  ON public.gpay_claims (idempotency_key)
  WHERE idempotency_key IS NOT NULL AND trim(idempotency_key) <> '';

CREATE INDEX IF NOT EXISTS gpay_claims_user_status_created ON public.gpay_claims (user_id, status, created_at DESC);

COMMENT ON TABLE public.gpay_claims IS 'GPay claim requests; ledger movements use claim_reserve / claim_release / claim_settle via RPC.';

-- ========== RLS ==========
ALTER TABLE public.gpay_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gpay_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gpay_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own gpay_balances" ON public.gpay_balances;
CREATE POLICY "Users read own gpay_balances"
  ON public.gpay_balances FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access gpay_balances" ON public.gpay_balances;
CREATE POLICY "Service role full access gpay_balances"
  ON public.gpay_balances FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "Users read own gpay_ledger" ON public.gpay_ledger;
CREATE POLICY "Users read own gpay_ledger"
  ON public.gpay_ledger FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access gpay_ledger" ON public.gpay_ledger;
CREATE POLICY "Service role full access gpay_ledger"
  ON public.gpay_ledger FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "Users read own gpay_claims" ON public.gpay_claims;
CREATE POLICY "Users read own gpay_claims"
  ON public.gpay_claims FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access gpay_claims" ON public.gpay_claims;
CREATE POLICY "Service role full access gpay_claims"
  ON public.gpay_claims FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ========== Atomic RPC ==========
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
    'claim_reserve', 'claim_release', 'claim_settle'
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

  -- Deltas by event
  IF p_event_type IN ('reward_earn', 'referral_reward', 'game_reward', 'ad_reward', 'manual_credit') THEN
    IF p_amount_minor IS NULL OR p_amount_minor <= 0 THEN
      RETURN jsonb_build_object('success', false, 'message', 'Amount must be positive');
    END IF;
    d_avail := p_amount_minor;
    d_life := p_amount_minor;
  ELSIF p_event_type = 'manual_debit' THEN
    IF p_amount_minor IS NULL OR p_amount_minor >= 0 THEN
      RETURN jsonb_build_object('success', false, 'message', 'manual_debit requires negative amount_minor');
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

COMMENT ON FUNCTION public.gpay_ledger_entry IS 'Atomic GPay movement: append gpay_ledger, update gpay_balances. Minor units only. Duplicate reference rejected.';

GRANT EXECUTE ON FUNCTION public.gpay_ledger_entry(uuid, text, bigint, text, jsonb) TO service_role;
