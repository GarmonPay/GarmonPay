-- Enable Supabase Realtime for C-Lo tables (requires project to use supabase_realtime publication).

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'celo_rounds'
    ) then
      alter publication supabase_realtime add table public.celo_rounds;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'celo_player_rolls'
    ) then
      alter publication supabase_realtime add table public.celo_player_rolls;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'celo_room_players'
    ) then
      alter publication supabase_realtime add table public.celo_room_players;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'celo_side_bets'
    ) then
      alter publication supabase_realtime add table public.celo_side_bets;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'celo_chat'
    ) then
      alter publication supabase_realtime add table public.celo_chat;
    end if;
  end if;
end $$;
