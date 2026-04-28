-- Phase-gate C-Lo settlement math changes and route platform fees into platform_balance atomically.

ALTER TABLE public.celo_rounds
  ADD COLUMN IF NOT EXISTS settlement_version integer;

UPDATE public.celo_rounds
SET settlement_version = 1
WHERE settlement_version IS NULL;

ALTER TABLE public.celo_rounds
  ALTER COLUMN settlement_version SET DEFAULT 2;

ALTER TABLE public.celo_rounds
  ALTER COLUMN settlement_version SET NOT NULL;

COMMENT ON COLUMN public.celo_rounds.settlement_version IS
  'Settlement logic version. Existing in-flight rounds keep v1; new rounds start as v2.';

ALTER TABLE public.platform_earnings
  ADD COLUMN IF NOT EXISTS round_id uuid REFERENCES public.celo_rounds (id) ON DELETE SET NULL;

ALTER TABLE public.platform_earnings
  ADD COLUMN IF NOT EXISTS fee_type text;

ALTER TABLE public.platform_earnings
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS platform_earnings_idempotency_key_unique
  ON public.platform_earnings (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS platform_earnings_round_fee_type_idx
  ON public.platform_earnings (round_id, fee_type, created_at DESC);

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
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NULL THEN
    RETURN jsonb_build_object('inserted', false, 'idempotency_key', v_key);
  END IF;

  PERFORM public.platform_record_revenue(v_amount, 'celo_fee');

  RETURN jsonb_build_object('inserted', true, 'id', v_inserted_id, 'idempotency_key', v_key);
END;
$$;

GRANT EXECUTE ON FUNCTION public.celo_record_platform_fee(uuid, text, integer, text, uuid, text) TO service_role;
