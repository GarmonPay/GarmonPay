-- Expand withdrawals.method + request_withdrawal to support $GPAY / payout methods.
-- Legacy values (crypto, bank) remain valid on existing rows.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname AS name
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'withdrawals'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%method%'
  LOOP
    EXECUTE format('ALTER TABLE public.withdrawals DROP CONSTRAINT %I', r.name);
  END LOOP;
END $$;

ALTER TABLE public.withdrawals
  ADD CONSTRAINT withdrawals_method_check
  CHECK (
    method IN (
      'gpay_tokens',
      'bank_transfer',
      'cashapp',
      'paypal',
      'crypto',
      'bank'
    )
  );

CREATE OR REPLACE FUNCTION public.request_withdrawal(
  p_user_id uuid,
  p_amount_cents bigint,
  p_method text,
  p_wallet_address text,
  p_ip_address text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_withdrawable numeric;
  v_platform_fee numeric;
  v_net_amount numeric;
  v_row public.withdrawals%rowtype;
  v_today_count int;
  v_last_created timestamptz;
  min_cents bigint := 1000;
  max_per_day int := 3;
  cooldown_min interval := interval '5 minutes';
BEGIN
  IF p_amount_cents IS NULL OR p_amount_cents < min_cents THEN
    RETURN jsonb_build_object('success', false, 'message', 'Minimum withdrawal is $10.00');
  END IF;
  IF p_method IS NULL OR trim(p_method) = '' OR trim(p_method) NOT IN (
    'gpay_tokens', 'bank_transfer', 'cashapp', 'paypal', 'crypto', 'bank'
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid method');
  END IF;
  IF p_wallet_address IS NULL OR trim(p_wallet_address) = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Wallet address required');
  END IF;

  SELECT withdrawable_balance INTO v_withdrawable FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF v_withdrawable IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'User not found');
  END IF;
  IF v_withdrawable < p_amount_cents THEN
    RETURN jsonb_build_object('success', false, 'message', 'Insufficient withdrawable balance');
  END IF;

  SELECT count(*) INTO v_today_count
  FROM public.withdrawals
  WHERE user_id = p_user_id
    AND created_at >= date_trunc('day', now())
    AND status IN ('pending', 'approved', 'paid');
  IF v_today_count >= max_per_day THEN
    RETURN jsonb_build_object('success', false, 'message', 'Maximum 3 withdrawals per day. Try again tomorrow.');
  END IF;

  SELECT max(created_at) INTO v_last_created
  FROM public.withdrawals
  WHERE user_id = p_user_id AND status IN ('pending', 'approved', 'paid');
  IF v_last_created IS NOT NULL AND (now() - v_last_created) < cooldown_min THEN
    RETURN jsonb_build_object('success', false, 'message', 'Please wait 5 minutes between withdrawal requests.');
  END IF;

  v_platform_fee := round(p_amount_cents * 0.10);
  v_net_amount := p_amount_cents - v_platform_fee;

  UPDATE public.users
  SET withdrawable_balance = withdrawable_balance - p_amount_cents,
      pending_balance = pending_balance + p_amount_cents,
      updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO public.withdrawals (
    user_id, amount, platform_fee, net_amount, status, method, wallet_address, ip_address
  )
  VALUES (
    p_user_id, p_amount_cents, v_platform_fee, v_net_amount, 'pending', trim(p_method),
    trim(p_wallet_address), nullif(trim(coalesce(p_ip_address, '')), '')
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'success', true,
    'withdrawal', jsonb_build_object(
      'id', v_row.id,
      'amount', v_row.amount,
      'platform_fee', v_row.platform_fee,
      'net_amount', v_row.net_amount,
      'status', v_row.status,
      'method', v_row.method,
      'wallet_address', v_row.wallet_address,
      'created_at', v_row.created_at
    )
  );
END;
$$;

COMMENT ON FUNCTION public.request_withdrawal(uuid, bigint, text, text, text) IS
  'Request withdrawal; p_method: gpay_tokens | bank_transfer | cashapp | paypal (legacy: crypto, bank).';
