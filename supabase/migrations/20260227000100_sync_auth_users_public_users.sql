-- Keep public.users synchronized with Supabase Auth users.

create table if not exists public.users (
  id uuid primary key,
  email text,
  role text default 'user',
  is_admin boolean default false,
  is_super_admin boolean default false,
  created_at timestamp with time zone default now()
);

insert into public.users (id, email)
select id, email from auth.users
on conflict (id) do nothing;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
