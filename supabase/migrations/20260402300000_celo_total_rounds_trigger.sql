-- Increment celo_rooms.total_rounds when a round first reaches status = completed
CREATE OR REPLACE FUNCTION public.celo_bump_room_total_rounds()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.status = 'completed'
     AND (OLD.status IS DISTINCT FROM 'completed') THEN
    UPDATE public.celo_rooms
    SET total_rounds = COALESCE(total_rounds, 0) + 1
    WHERE id = NEW.room_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS celo_rounds_bump_total_rounds ON public.celo_rounds;
CREATE TRIGGER celo_rounds_bump_total_rounds
  AFTER UPDATE OF status ON public.celo_rounds
  FOR EACH ROW
  EXECUTE PROCEDURE public.celo_bump_room_total_rounds();
