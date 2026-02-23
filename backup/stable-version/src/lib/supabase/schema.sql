-- GarmonPay Supabase schema (run in Supabase SQL editor when connecting).
-- Rewards issued ONLY from backend. Never trust frontend for rewards.

-- Enable UUID extension if not exists
create extension if not exists "uuid-ossp";

-- Users: role (member|admin), membership, balances
create table if not exists public.users (
  id uuid primary key default uuid_generate_v4(),
  email text not null unique,
  password_hash text not null,
  role text not null default 'member' check (role in ('member', 'admin')),
  membership_tier text not null default 'starter' check (membership_tier in ('starter', 'pro', 'elite', 'vip')),
  earnings_cents bigint not null default 0,
  balance_cents bigint not null default 0,
  withdrawable_cents bigint not null default 0,
  referral_code text not null unique,
  referred_by_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists users_email_idx on public.users (email);
create index if not exists users_role_idx on public.users (role);
create index if not exists users_referral_code_idx on public.users (referral_code);

-- Earnings (aggregate or per-transaction; adjust to your model)
create table if not exists public.earnings (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users (id) on delete cascade,
  amount_cents bigint not null,
  source text not null,
  created_at timestamptz not null default now()
);

create index if not exists earnings_user_id_idx on public.earnings (user_id);

-- Ads (ad inventory)
create table if not exists public.ads (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  reward_cents bigint not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ad sessions: created when user clicks ad; timer must complete before reward
create table if not exists public.ad_sessions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users (id) on delete cascade,
  ad_id uuid not null references public.ads (id) on delete cascade,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  completed boolean not null default false,
  reward_issued boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists ad_sessions_user_id_idx on public.ad_sessions (user_id);

-- Ad rewards: issued ONLY by backend after session validation
create table if not exists public.ad_rewards (
  id uuid primary key default uuid_generate_v4(),
  ad_session_id uuid not null references public.ad_sessions (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  amount_cents bigint not null,
  issued_at timestamptz not null default now(),
  issued_by text not null default 'backend'
);

-- Click tracking for fraud/bot detection
create table if not exists public.ad_clicks (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users (id) on delete cascade,
  ad_id uuid not null references public.ads (id) on delete cascade,
  clicked_at timestamptz not null default now(),
  session_id text,
  ip_hash text
);

create index if not exists ad_clicks_user_id_idx on public.ad_clicks (user_id);
create index if not exists ad_clicks_clicked_at_idx on public.ad_clicks (clicked_at);

-- Referrals
create table if not exists public.referrals (
  id uuid primary key default uuid_generate_v4(),
  referrer_id uuid not null references public.users (id) on delete cascade,
  referred_id uuid not null references public.users (id) on delete cascade,
  referral_code text not null,
  joined_at timestamptz not null default now(),
  referral_earnings_cents bigint not null default 0
);

create index if not exists referrals_referrer_id_idx on public.referrals (referrer_id);

-- RLS: enable and define policies per your security requirements.
-- alter table public.users enable row level security;
-- etc.
