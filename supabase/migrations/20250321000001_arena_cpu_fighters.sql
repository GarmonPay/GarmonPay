-- Arena: 6 CPU fighters for tap-to-punch (one fighter per user).
-- public.users.id must reference auth.users. Do not INSERT into auth.users here (Supabase migration role
-- cannot reliably delete/upsert auth.users; remote DBs often already have these IDs in auth).
-- Sync public.users + arena_fighters from existing auth.users rows when all 6 CPU auth users exist.

-- Make handle_new_user idempotent (avoids duplicate public.users_pkey when profile row already exists).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email, role, balance, created_at)
  values (new.id, new.email, 'user', 0, now())
  on conflict (id) do update set email = excluded.email;

  insert into public.wallets (user_id, balance)
  values (new.id, 0)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

do $arena_cpu$
declare
  cpu_ids uuid[] := array[
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'a0000000-0000-0000-0000-000000000002'::uuid,
    'a0000000-0000-0000-0000-000000000003'::uuid,
    'a0000000-0000-0000-0000-000000000004'::uuid,
    'a0000000-0000-0000-0000-000000000005'::uuid,
    'a0000000-0000-0000-0000-000000000006'::uuid
  ]::uuid[];
  auth_count int;
begin
  perform set_config('row_security', 'off', true);

  select count(*)::int into auth_count from auth.users u where u.id = any (cpu_ids);

  if auth_count <> 6 then
    raise notice 'Arena CPU: expected 6 rows in auth.users for CPU ids; found %. Skipping arena CPU seed. Create those auth users (e.g. Dashboard) and re-run or apply scripts/arena_cpu_auth.sql.', auth_count;
    return;
  end if;

  delete from public.arena_fighters where user_id = any (cpu_ids);
  delete from public.wallets where user_id = any (cpu_ids);
  delete from public.users where id = any (cpu_ids);

  insert into public.users (id, email, balance, role, is_super_admin, created_at)
  select u.id, coalesce(u.email, 'arena-cpu@garmonpay.internal'), 0, 'user', false, now()
  from auth.users u
  where u.id = any (cpu_ids)
  on conflict (id) do update set email = excluded.email;

  insert into public.wallets (user_id, balance)
  select u.id, 0
  from auth.users u
  where u.id = any (cpu_ids)
  on conflict (user_id) do nothing;

  insert into public.arena_fighters (
    user_id, name, style, avatar,
    strength, speed, stamina, defense, chin, special
  ) values
    ('a0000000-0000-0000-0000-000000000001', 'Brutus', 'Brawler', '🥊', 65, 45, 50, 45, 60, 25),
    ('a0000000-0000-0000-0000-000000000002', 'Shadow', 'Boxer', '🥊', 52, 62, 55, 58, 48, 28),
    ('a0000000-0000-0000-0000-000000000003', 'Tank', 'Slugger', '🥊', 72, 38, 48, 42, 65, 30),
    ('a0000000-0000-0000-0000-000000000004', 'Slick', 'Counter Puncher', '🥊', 48, 58, 52, 68, 50, 32),
    ('a0000000-0000-0000-0000-000000000005', 'Rush', 'Swarmer', '🥊', 55, 68, 58, 44, 48, 26),
    ('a0000000-0000-0000-0000-000000000006', 'Ice', 'Technician', '🥊', 50, 55, 54, 62, 52, 35)
  on conflict (user_id) do nothing;
end
$arena_cpu$;
