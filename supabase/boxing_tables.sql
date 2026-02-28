-- Boxing admin: simple bets table for revenue (10% platform fee).
-- Run in Supabase → SQL Editor. (fights table may already exist with different columns.)
create table if not exists public.fights (
  id uuid primary key default gen_random_uuid(),
  fighter_a text,
  fighter_b text,
  min_bet numeric default 1,
  max_bet numeric default 1000,
  status text default 'open',
  created_at timestamptz default now()
);

create table if not exists public.bets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id),
  fight_id uuid references public.fights(id),
  amount numeric,
  pick text,
  created_at timestamptz default now()
);

create index if not exists bets_fight_id on public.bets (fight_id);
create index if not exists bets_user_id on public.bets (user_id);
