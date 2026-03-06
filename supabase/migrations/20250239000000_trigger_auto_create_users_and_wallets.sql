-- =============================================================================
-- CRITICAL: Auto-create public.users and public.wallet on every auth signup.
-- Run in Supabase SQL Editor or: supabase db push
-- Uses real auth.users only. No demo users.
-- =============================================================================

-- 1) Ensure public.users exists (id must reference auth.users for cascade)
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text default 'user',
  balance numeric default 0,
  created_at timestamptz default now()
);

alter table public.users add column if not exists email text;
alter table public.users add column if not exists role text default 'user';
alter table public.users add column if not exists balance numeric default 0;
alter table public.users add column if not exists created_at timestamptz default now();
alter table public.users add column if not exists is_super_admin boolean default false;

-- 2) Ensure public.wallet exists
create table if not exists public.wallet (
  user_id uuid primary key references public.users(id) on delete cascade,
  balance numeric not null default 0,
  updated_at timestamptz not null default now()
);

-- 3) Function: insert into public.users and public.wallet on new auth user
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

  insert into public.wallet (user_id, balance, updated_at)
  values (new.id, 0, now())
  on conflict (user_id) do update set updated_at = now();

  return new;
end;
$$;

-- 4) Trigger: run on every insert into auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

comment on function public.handle_new_user() is 'Auto-creates public.users and public.wallet row when a new auth.users row is inserted.';
