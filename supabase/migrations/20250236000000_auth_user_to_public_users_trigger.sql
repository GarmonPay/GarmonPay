-- =============================================================================
-- GarmonPay: Auto-create public.users row when a new auth user signs up
-- Ensures every auth.users insert gets a corresponding public.users row so
-- admin dashboard and app read from public.users and see correct member count.
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (
    id,
    email,
    balance,
    role,
    is_super_admin,
    created_at
  )
  values (
    new.id,
    new.email,
    0,
    'user',
    false,
    now()
  )
  on conflict (id) do update set
    email = excluded.email;
  return new;
end;
$$;

-- Replace any existing auth trigger so this is the single source of truth
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

comment on function public.handle_new_user() is 'Inserts a row into public.users when a new auth.users row is created; used by on_auth_user_created trigger.';
