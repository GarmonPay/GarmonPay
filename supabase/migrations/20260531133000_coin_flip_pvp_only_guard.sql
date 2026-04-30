-- Coin Flip is now PvP-only for new activity.
-- Keep historical vs_house rows for audit; block new vs_house writes.

CREATE OR REPLACE FUNCTION public.coin_flip_pvp_only_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.mode IS DISTINCT FROM 'vs_player' THEN
    RAISE EXCEPTION 'Player vs House mode is no longer supported.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_coin_flip_pvp_only_guard ON public.coin_flip_games;
CREATE TRIGGER trg_coin_flip_pvp_only_guard
BEFORE INSERT OR UPDATE OF mode
ON public.coin_flip_games
FOR EACH ROW
EXECUTE FUNCTION public.coin_flip_pvp_only_guard();
