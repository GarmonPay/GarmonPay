-- Add ad_earning type to wallet ledger for GarmonPay ad engagement payouts.
-- Amount in cents: positive = credit to user.

ALTER TABLE public.wallet_ledger DROP CONSTRAINT IF EXISTS wallet_ledger_type_check;
ALTER TABLE public.wallet_ledger ADD CONSTRAINT wallet_ledger_type_check CHECK (type IN (
  'deposit', 'withdrawal', 'game_play', 'game_win', 'referral_bonus',
  'subscription_payment', 'commission_payout', 'admin_adjustment', 'ad_earning'
));

-- Update wallet_ledger_entry to accept ad_earning
CREATE OR REPLACE FUNCTION public.wallet_ledger_entry(
  p_user_id uuid,
  p_type text,
  p_amount_cents bigint,
  p_reference text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current bigint;
  v_balance_after bigint;
  v_ledger_id uuid;
  v_valid_types text[] := array[
    'deposit','withdrawal','game_play','game_win','referral_bonus',
    'subscription_payment','commission_payout','admin_adjustment','ad_earning'
  ];
BEGIN
  IF p_type IS NULL OR NOT (p_type = ANY(v_valid_types)) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid type');
  END IF;
  IF p_amount_cents = 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Amount cannot be zero');
  END IF;
  IF p_reference IS NOT NULL AND trim(p_reference) != '' THEN
    IF EXISTS (SELECT 1 FROM public.wallet_ledger WHERE reference = p_reference) THEN
      RETURN jsonb_build_object('success', false, 'message', 'Duplicate transaction');
    END IF;
  END IF;

  INSERT INTO public.wallet_balances (user_id, balance, updated_at)
  VALUES (p_user_id, 0, now())
  ON CONFLICT (user_id) DO NOTHING;

  SELECT balance INTO v_current
  FROM public.wallet_balances
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_current IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'User balance row not found');
  END IF;

  v_balance_after := v_current + p_amount_cents;

  IF v_balance_after < 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Insufficient balance');
  END IF;

  INSERT INTO public.wallet_ledger (user_id, type, amount, balance_after, reference)
  VALUES (p_user_id, p_type, p_amount_cents, v_balance_after, nullif(trim(p_reference), ''))
  RETURNING id INTO v_ledger_id;

  UPDATE public.wallet_balances
  SET balance = v_balance_after, updated_at = now()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'balance_cents', v_balance_after,
    'ledger_id', v_ledger_id
  );
END;
$$;
