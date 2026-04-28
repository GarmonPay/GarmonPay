-- Atomic incremental updates for player-phase settlement (avoids lost increments under concurrency).
CREATE OR REPLACE FUNCTION public.celo_increment_round_banker_accounting(
  p_round_id uuid,
  p_delta_pnl integer,
  p_delta_fee integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.celo_rounds
  SET
    banker_winnings_sc = COALESCE(banker_winnings_sc, 0) + p_delta_pnl,
    platform_fee_sc = COALESCE(platform_fee_sc, 0) + p_delta_fee
  WHERE id = p_round_id;
END;
$$;

REVOKE ALL ON FUNCTION public.celo_increment_round_banker_accounting(uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.celo_increment_round_banker_accounting(uuid, integer, integer) TO service_role;
