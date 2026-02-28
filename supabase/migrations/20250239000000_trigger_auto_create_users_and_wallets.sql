-- =============================================================================
-- CRITICAL: Auto-create public.users and public.wallets on every auth signup.
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

-- 2) Ensure public.wallets exists
create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  balance numeric not null default 0,
  created_at timestamptz default now(),
  unique(user_id)
);

create index if not exists wallets_user_id on public.wallets (user_id);
alter table public.wallets enable row level security;

drop policy if exists "Service role full access wallets" on public.wallets;
create policy "Service role full access wallets"
  on public.wallets for all using (auth.jwt() ->> 'role' = 'service_role');

drop policy if exists "Users can read own wallet" on public.wallets;
create policy "Users can read own wallet"
  on public.wallets for select using (auth.uid() = user_id);

-- 3) Function: insert into public.users and public.wallets on new auth user
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

-- 4) Trigger: run on every insert into auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

comment on function public.handle_new_user() is 'Auto-creates public.users and public.wallets row when a new auth.users row is inserted.';
