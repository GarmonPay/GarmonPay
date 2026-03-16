-- Run this in Supabase Dashboard → SQL Editor if "Failed to create fighter" appears.
-- Creates only what's needed for fighter creation. Safe to run multiple times (idempotent).

-- 1) Users: arena_coins column (for Arena store later)
alter table public.users add column if not exists arena_coins int not null default 0;

-- 2) Weight classes (reference; used by app)
create table if not exists public.arena_weight_classes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  min_total_stats int not null,
  max_total_stats int not null,
  created_at timestamptz default now()
);
insert into public.arena_weight_classes (name, min_total_stats, max_total_stats) values
  ('Lightweight', 0, 319),
  ('Middleweight', 320, 420),
  ('Heavyweight', 421, 520),
  ('Unlimited', 521, 9999)
on conflict (name) do nothing;

-- 3) Fighters table (required for "Enter the Arena")
create table if not exists public.arena_fighters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  style text not null,
  avatar text not null,
  title text,
  strength int not null default 48,
  speed int not null default 48,
  stamina int not null default 48,
  defense int not null default 48,
  chin int not null default 48,
  special int not null default 20,
  wins int not null default 0,
  losses int not null default 0,
  training_sessions int not null default 0,
  equipped_gloves uuid,
  equipped_shoes uuid,
  equipped_shorts uuid,
  equipped_headgear uuid,
  condition text not null default 'fresh' check (condition in ('fresh','tired','injured')),
  win_streak int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id)
);
create index if not exists arena_fighters_user_id on public.arena_fighters(user_id);
create index if not exists arena_fighters_condition on public.arena_fighters(condition);

-- RLS (service role bypasses this; app uses service role for arena APIs)
alter table public.arena_fighters enable row level security;
