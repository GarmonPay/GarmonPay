-- =============================================================================
-- Ensure public.users and public.deposits exist with required columns.
-- Production: use NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY.
-- =============================================================================

-- Users: id must reference auth.users for trigger/backfill to work
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text default 'user',
  created_at timestamptz default now()
);

alter table public.users add column if not exists email text;
alter table public.users add column if not exists role text default 'user';
alter table public.users add column if not exists balance numeric default 0;
alter table public.users add column if not exists created_at timestamptz default now();

-- Deposits
create table if not exists public.deposits (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id),
  amount numeric,
  status text,
  created_at timestamptz default now()
);

alter table public.deposits add column if not exists user_id uuid references public.users(id);
alter table public.deposits add column if not exists amount numeric;
alter table public.deposits add column if not exists status text;
alter table public.deposits add column if not exists stripe_session text;
alter table public.deposits add column if not exists created_at timestamptz default now();
