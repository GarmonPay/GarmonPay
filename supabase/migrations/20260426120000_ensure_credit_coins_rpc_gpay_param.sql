-- Idempotent: ensure public.credit_coins uses p_gpay_coins (PostgREST matches RPC args by name).
-- Fixes "Could not find the function public.credit_coins(p_gold_coins, p_gpay_coins, p_user_id)"
-- when an older DB still had the legacy third parameter name p_sweeps_coins.

CREATE OR REPLACE FUNCTION public.credit_coins(
  p_user_id uuid,
  p_gold_coins integer,
  p_gpay_coins integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.users SET
    gold_coins = COALESCE(gold_coins, 0) + COALESCE(p_gold_coins, 0),
    gpay_coins = COALESCE(gpay_coins, 0) + COALESCE(p_gpay_coins, 0),
    lifetime_gc_purchased = COALESCE(lifetime_gc_purchased, 0) + GREATEST(0, COALESCE(p_gold_coins, 0)),
    lifetime_sc_earned = COALESCE(lifetime_sc_earned, 0) + GREATEST(0, COALESCE(p_gpay_coins, 0))
  WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.credit_coins(uuid, integer, integer) TO service_role;

COMMENT ON FUNCTION public.credit_coins(uuid, integer, integer) IS 'Credits GC and/or GPC (gpay_coins) on users.';
