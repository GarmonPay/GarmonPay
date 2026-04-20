-- Atomically debit users.gpay_coins and insert coin_transactions.
-- Fixes PostgREST inserts failing RLS after debit_gpay_coins RPC (e.g. Coin Flip "Loss transaction insert failed").

CREATE OR REPLACE FUNCTION public.debit_gpay_coins_with_ledger(
  p_user_id uuid,
  p_amount integer,
  p_type text,
  p_description text,
  p_reference text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'user_id required');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid amount');
  END IF;
  IF p_reference IS NULL OR trim(p_reference) = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'reference required');
  END IF;

  IF EXISTS (SELECT 1 FROM public.coin_transactions WHERE reference = p_reference) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Duplicate transaction');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'User not found');
  END IF;

  -- No SELECT ... INTO (avoids tools/plain SQL misparsing PL/pgSQL variables as relations).
  UPDATE public.users u
  SET gpay_coins = u.gpay_coins - p_amount
  WHERE u.id = p_user_id
    AND u.gpay_coins >= p_amount;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Insufficient gpay coins');
  END IF;

  INSERT INTO public.coin_transactions (user_id, type, gold_coins, gpay_coins, description, reference)
  VALUES (
    p_user_id,
    COALESCE(NULLIF(trim(p_type), ''), 'debit'),
    0,
    -p_amount,
    p_description,
    p_reference
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION public.debit_gpay_coins_with_ledger(uuid, integer, text, text, text)
  IS 'Atomically debits GPC and inserts coin_transactions (single transaction; DEFINER bypasses RLS on insert).';

GRANT EXECUTE ON FUNCTION public.debit_gpay_coins_with_ledger(uuid, integer, text, text, text) TO service_role;

-- Belt-and-suspenders: allow API inserts when using service_role JWT (matches public.transactions pattern).
DROP POLICY IF EXISTS "Service role full access coin_transactions" ON public.coin_transactions;
CREATE POLICY "Service role full access coin_transactions"
  ON public.coin_transactions FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');
