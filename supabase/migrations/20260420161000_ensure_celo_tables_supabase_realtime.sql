-- Idempotent: ensure core C-Lo tables are in supabase_realtime (postgres_changes).
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
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'celo_rooms'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.celo_rooms;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'celo_room_players'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.celo_room_players;
    END IF;
  END IF;
END $$;
