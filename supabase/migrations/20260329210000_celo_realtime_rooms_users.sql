-- Realtime: lobby + balance sync for C-Lo (celo_rooms updates, users balance updates)

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'celo_rooms'
    ) then
      alter publication supabase_realtime add table public.celo_rooms;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'users'
    ) then
      alter publication supabase_realtime add table public.users;
    end if;
  end if;
end $$;
