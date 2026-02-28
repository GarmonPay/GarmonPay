-- =============================================================================
-- GarmonPay: Complete production database structure
-- Run in Supabase SQL Editor or via: supabase db push
-- All tables link to auth.users via public.users(id).
-- =============================================================================

-- -------------------------
-- USERS TABLE
-- -------------------------
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  balance numeric default 0,
  role text default 'user',
  is_super_admin boolean default false,
  created_at timestamp default now()
);

-- Ensure columns exist if table was created by an earlier migration
alter table public.users add column if not exists email text;
alter table public.users add column if not exists balance numeric default 0;
alter table public.users add column if not exists role text default 'user';
alter table public.users add column if not exists is_super_admin boolean default false;
alter table public.users add column if not exists created_at timestamptz default now();

-- -------------------------
-- DEPOSITS
-- -------------------------
create table if not exists public.deposits (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id),
  amount numeric,
  stripe_session text,
  created_at timestamp default now()
);

-- -------------------------
-- WITHDRAWALS
-- -------------------------
create table if not exists public.withdrawals (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id),
  amount numeric,
  status text default 'pending',
  created_at timestamp default now()
);

-- -------------------------
-- TRANSACTIONS
-- -------------------------
create table if not exists public.transactions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid,
  type text,
  amount numeric,
  created_at timestamp default now()
);

-- -------------------------
-- EARNINGS
-- -------------------------
create table if not exists public.earnings (
  id uuid default gen_random_uuid() primary key,
  user_id uuid,
  amount numeric,
  source text,
  created_at timestamp default now()
);

-- -------------------------
-- PROFIT
-- -------------------------
create table if not exists public.profit (
  id uuid default gen_random_uuid() primary key,
  amount numeric,
  source text,
  created_at timestamp default now()
);

-- -------------------------
-- REVENUE
-- -------------------------
create table if not exists public.revenue (
  id uuid default gen_random_uuid() primary key,
  amount numeric,
  source text,
  created_at timestamp default now()
);

-- -------------------------
-- REFERRALS
-- -------------------------
create table if not exists public.referrals (
  id uuid default gen_random_uuid() primary key,
  referrer uuid,
  referred uuid,
  commission numeric default 0,
  created_at timestamp default now()
);

-- -------------------------
-- ADS
-- -------------------------
create table if not exists public.ads (
  id uuid default gen_random_uuid() primary key,
  user_id uuid,
  budget numeric,
  spent numeric default 0,
  status text default 'active',
  created_at timestamp default now()
);

-- -------------------------
-- BANNERS
-- -------------------------
create table if not exists public.banners (
  id uuid default gen_random_uuid() primary key,
  image text,
  link text,
  created_at timestamp default now()
);

-- -------------------------
-- ADMIN LOGS
-- -------------------------
create table if not exists public.admin_logs (
  id uuid default gen_random_uuid() primary key,
  action text,
  admin_id uuid,
  created_at timestamp default now()
);

-- -------------------------
-- GAMIFICATION
-- -------------------------
create table if not exists public.gamification (
  id uuid default gen_random_uuid() primary key,
  user_id uuid,
  points numeric default 0,
  level numeric default 1,
  created_at timestamp default now()
);

-- -------------------------
-- SETTINGS
-- -------------------------
create table if not exists public.settings (
  id uuid default gen_random_uuid() primary key,
  site_profit_percent numeric default 30,
  referral_percent numeric default 10,
  min_withdraw numeric default 10,
  created_at timestamp default now()
);

-- =============================================================================
-- ENABLE RLS ON ALL TABLES
-- =============================================================================
alter table public.users enable row level security;
alter table public.deposits enable row level security;
alter table public.withdrawals enable row level security;
alter table public.transactions enable row level security;
alter table public.earnings enable row level security;
alter table public.profit enable row level security;
alter table public.revenue enable row level security;
alter table public.referrals enable row level security;
alter table public.ads enable row level security;
alter table public.banners enable row level security;
alter table public.admin_logs enable row level security;
alter table public.gamification enable row level security;
alter table public.settings enable row level security;
