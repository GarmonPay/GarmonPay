-- Ensure wallet_balances + celo_rooms are in supabase_realtime (client subscriptions).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'wallet_balances'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.wallet_balances;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'celo_rooms'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.celo_rooms;
    END IF;
  END IF;
END $$;
