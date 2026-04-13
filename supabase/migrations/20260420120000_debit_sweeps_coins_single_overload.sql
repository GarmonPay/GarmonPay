-- PostgREST cannot choose between (uuid,integer) and (integer,uuid) when both exist.
-- Drop every overload of debit_sweeps_coins, then create exactly one canonical signature.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS fn
    FROM pg_proc p
    INNER JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'debit_sweeps_coins'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.fn::text || ' CASCADE';
  END LOOP;
END $$;

CREATE FUNCTION public.debit_sweeps_coins(
  p_user_id uuid,
  p_amount integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (
    SELECT sweeps_coins
    FROM public.users
    WHERE id = p_user_id
  ) < p_amount THEN
    RAISE EXCEPTION 'Insufficient sweeps coins';
  END IF;

  UPDATE public.users
  SET sweeps_coins = sweeps_coins - p_amount
  WHERE id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.debit_sweeps_coins(uuid, integer) TO service_role;
