-- Allow anonymous clients to receive Realtime postgres_changes for public C-Lo rooms
-- (SELECT must pass RLS for the subscription to deliver events).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'celo_rounds'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.celo_rounds;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'celo_player_rolls'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.celo_player_rolls;
    END IF;
  END IF;
END $$;

DROP POLICY IF EXISTS "Anon read rounds in public rooms" ON public.celo_rounds;
CREATE POLICY "Anon read rounds in public rooms"
  ON public.celo_rounds FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.celo_rooms r
      WHERE r.id = celo_rounds.room_id AND r.room_type = 'public'
    )
  );

DROP POLICY IF EXISTS "Anon read rolls in public rooms" ON public.celo_player_rolls;
CREATE POLICY "Anon read rolls in public rooms"
  ON public.celo_player_rolls FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.celo_rooms r
      WHERE r.id = celo_player_rolls.room_id AND r.room_type = 'public'
    )
  );
