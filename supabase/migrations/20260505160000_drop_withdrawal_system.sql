-- Remove USD payout / withdrawal subsystem: tables, RPCs tied to payouts, dead user balance mirrors.

-- Stripe wallet funding must not reference dropped columns (see 20250248000000_payment_tables_and_columns.sql).
CREATE OR REPLACE FUNCTION public.increment_user_balance(p_user_id uuid, p_amount_cents bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN RETURN; END IF;
  UPDATE public.users
  SET balance = COALESCE(balance, 0) + p_amount_cents,
      updated_at = now()
  WHERE id = p_user_id;
END;
$$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS pname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'request_withdrawal',
        'submit_withdrawal',
        'reject_withdrawal',
        'approve_withdrawal',
        'request_withdrawal_gpay'
      )
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.pname::text || ' CASCADE';
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.reject_withdrawal_refund(uuid, uuid) CASCADE;

DROP TABLE IF EXISTS public.withdrawal_requests CASCADE;
DROP TABLE IF EXISTS public.withdrawals CASCADE;

ALTER TABLE public.users DROP COLUMN IF EXISTS withdrawable_balance;
ALTER TABLE public.users DROP COLUMN IF EXISTS pending_balance;
