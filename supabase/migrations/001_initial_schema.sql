-- Clean baseline schema for Supabase
-- Idempotent by design: safe for repeated execution.

create extension if not exists pgcrypto;

-- =========================
-- Core tables (required)
-- =========================

create table if not exists public.users (
  id uuid primary key,
  email text,
  balance numeric not null default 0,
  created_at timestamptz not null default now()
);

-- Compatibility columns used by current Next.js routes/services.
alter table public.users add column if not exists updated_at timestamptz not null default now();
alter table public.users add column if not exists total_deposits numeric not null default 0;
alter table public.users add column if not exists role text default 'user';
alter table public.users add column if not exists is_super_admin boolean not null default false;
alter table public.users add column if not exists membership text default 'starter';
alter table public.users add column if not exists referral_code text;
alter table public.users add column if not exists referred_by_code text;
alter table public.users add column if not exists rank_code text;
alter table public.users add column if not exists ad_credit_balance numeric not null default 0;
alter table public.users add column if not exists withdrawable_balance numeric not null default 0;
alter table public.users add column if not exists pending_balance numeric not null default 0;
alter table public.users add column if not exists lifetime_earnings numeric not null default 0;
alter table public.users add column if not exists total_earnings numeric not null default 0;
alter table public.users add column if not exists total_referrals integer not null default 0;
alter table public.users add column if not exists stripe_account_id text;

create index if not exists users_email_idx on public.users (email);
create unique index if not exists users_referral_code_uq on public.users (referral_code) where referral_code is not null;
create unique index if not exists users_stripe_account_id_uq on public.users (stripe_account_id) where stripe_account_id is not null;

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  amount numeric,
  type text,
  stripe_session text,
  created_at timestamptz not null default now()
);

-- Compatibility columns used by webhook/recovery/admin paths.
alter table public.transactions add column if not exists status text default 'pending';
alter table public.transactions add column if not exists description text;
alter table public.transactions add column if not exists reference_id text;
alter table public.transactions add column if not exists source text;

create table if not exists public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  amount numeric,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

-- Compatibility columns used by withdrawals RPCs/admin pages.
alter table public.withdrawals add column if not exists platform_fee numeric not null default 0;
alter table public.withdrawals add column if not exists net_amount numeric not null default 0;
alter table public.withdrawals add column if not exists method text default 'crypto';
alter table public.withdrawals add column if not exists wallet_address text default '';
alter table public.withdrawals add column if not exists processed_at timestamptz;
alter table public.withdrawals add column if not exists ip_address text;

create table if not exists public.stripe_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  session_id text,
  amount numeric,
  created_at timestamptz not null default now()
);

-- Compatibility columns used by webhook/recovery routes.
alter table public.stripe_payments add column if not exists stripe_session_id text;
alter table public.stripe_payments add column if not exists stripe_payment_intent_id text;
alter table public.stripe_payments add column if not exists stripe_payment_intent text;
alter table public.stripe_payments add column if not exists email text;
alter table public.stripe_payments add column if not exists currency text default 'usd';
alter table public.stripe_payments add column if not exists status text default 'completed';
alter table public.stripe_payments add column if not exists product_type text default 'payment';
alter table public.stripe_payments add column if not exists metadata jsonb;

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  referred_user uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.wallet (
  user_id uuid primary key references public.users(id) on delete cascade,
  balance numeric not null default 0,
  updated_at timestamptz not null default now()
);

-- =========================
-- Compatibility tables
-- =========================

create table if not exists public.deposits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  amount numeric,
  stripe_session text,
  stripe_session_id text,
  status text default 'completed',
  created_at timestamptz not null default now()
);

create table if not exists public.profit (
  id uuid primary key default gen_random_uuid(),
  amount numeric default 0,
  source text,
  created_at timestamptz not null default now()
);

create table if not exists public.revenue (
  id uuid primary key default gen_random_uuid(),
  amount numeric default 0,
  source text,
  created_at timestamptz not null default now()
);

create table if not exists public.revenue_transactions (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  amount numeric not null,
  type text not null check (type in ('payment', 'subscription')),
  created_at timestamptz not null default now()
);

create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  site_profit_percent numeric default 30,
  referral_percent numeric default 10,
  min_withdraw numeric default 10,
  created_at timestamptz not null default now()
);

-- =========================
-- Required function
-- =========================

create or replace function public.increment_user_balance(uid uuid, amount numeric)
returns void
language sql
as $$
  update public.users
  set balance = coalesce(balance, 0) + coalesce(amount, 0)
  where id = uid;
$$;

-- =========================
-- Required indexes
-- =========================

create index if not exists transactions_user_id_idx on public.transactions (user_id);
create index if not exists withdrawals_user_id_idx on public.withdrawals (user_id);
create index if not exists stripe_payments_user_id_idx on public.stripe_payments (user_id);

-- Helpful uniqueness/indexes for webhook idempotency.
create unique index if not exists transactions_reference_deposit_uq
  on public.transactions (reference_id, type)
  where reference_id is not null and type = 'deposit';

create unique index if not exists stripe_payments_session_uq
  on public.stripe_payments (stripe_session_id)
  where stripe_session_id is not null;

create index if not exists deposits_user_id_idx on public.deposits (user_id);
create index if not exists revenue_transactions_created_at_idx on public.revenue_transactions (created_at desc);
create index if not exists revenue_transactions_email_idx on public.revenue_transactions (email);
