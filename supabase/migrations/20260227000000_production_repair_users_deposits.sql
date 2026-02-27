create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key,
  email text,
  role text default 'user',
  created_at timestamp default now()
);

create table if not exists public.deposits (
  id uuid default gen_random_uuid() primary key,
  user_id uuid,
  amount numeric,
  stripe_session text,
  status text,
  created_at timestamp default now()
);

alter table public.deposits add column if not exists user_id uuid;
alter table public.deposits add column if not exists amount numeric;
alter table public.deposits add column if not exists stripe_session text;
alter table public.deposits add column if not exists status text;
alter table public.deposits add column if not exists created_at timestamp default now();

create index if not exists deposits_user_id_idx on public.deposits (user_id);
create index if not exists deposits_created_at_idx on public.deposits (created_at desc);
create unique index if not exists deposits_stripe_session_idx
  on public.deposits (stripe_session)
  where stripe_session is not null;
