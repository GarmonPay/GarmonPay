-- Supabase Realtime: send old + new row payloads for UPDATE (needed for dice diff detection)
ALTER TABLE public.celo_rounds REPLICA IDENTITY FULL;
ALTER TABLE public.celo_player_rolls REPLICA IDENTITY FULL;
