-- Ensure public.users table matches required authentication schema.
-- Table: public.users
-- id → uuid PRIMARY KEY, references auth.users(id) ON DELETE CASCADE
-- email → text
-- role → text, default 'user'
-- balance → numeric, default 0
-- is_super_admin → boolean, default false
-- created_at → timestamptz, default now()

-- Allow role 'user' in addition to 'member' and 'admin'
alter table public.users drop constraint if exists users_role_check;

alter table public.users
  alter column role set default 'user';

-- Ensure balance is numeric with default 0 (convert from bigint if needed)
alter table public.users
  alter column balance type numeric using (balance::numeric),
  alter column balance set default 0;

-- Ensure is_super_admin exists with correct default
alter table public.users
  add column if not exists is_super_admin boolean not null default false;

-- Ensure created_at has default now()
alter table public.users
  alter column created_at set default now();

-- Ensure FK: public.users.id → auth.users.id ON DELETE CASCADE (add only if missing)
do $$
begin
  if not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.users'::regclass
      and c.contype = 'f'
      and c.confrelid = 'auth.users'::regclass
  ) then
    alter table public.users
      add constraint users_auth_id_fkey
      foreign key (id) references auth.users (id) on delete cascade;
  end if;
end $$;

-- Index for admin lookups
create index if not exists users_is_super_admin on public.users (is_super_admin) where is_super_admin = true;

comment on table public.users is 'User profiles; id references auth.users(id) on delete cascade';
