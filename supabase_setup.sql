-- =============================================================================
-- GarmonPay Supabase schema repair — run in Supabase SQL Editor
-- Ensures required tables and increment_user_balance exist. Idempotent (safe to re-run).
-- Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
-- =============================================================================

-- ========== USERS ==========
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  balance numeric default 0,
  created_at timestamptz default now()
);

alter table public.users add column if not exists updated_at timestamptz default now();
alter table public.users add column if not exists total_deposits bigint default 0;
alter table public.users add column if not exists withdrawable_balance numeric default 0;
alter table public.users add column if not exists pending_balance numeric default 0;
alter table public.users add column if not exists referral_code text;
alter table public.users add column if not exists referred_by_code text;
alter table public.users add column if not exists referred_by uuid;

-- ========== TRANSACTIONS ==========
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users (id) on delete set null,
  amount numeric not null default 0,
  type text not null default 'deposit',
  stripe_session text,
  created_at timestamptz default now()
);

alter table public.transactions add column if not exists status text default 'completed';
alter table public.transactions add column if not exists description text;
alter table public.transactions add column if not exists reference_id text;

create index if not exists transactions_user_id on public.transactions (user_id);
create index if not exists transactions_created_at on public.transactions (created_at desc);
create index if not exists transactions_stripe_session on public.transactions (stripe_session) where stripe_session is not null;

alter table public.transactions add column if not exists stripe_session text;

-- ========== WITHDRAWALS ==========
create table if not exists public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users (id) on delete set null,
  amount numeric not null default 0,
  status text not null default 'pending',
  created_at timestamptz default now()
);

alter table public.withdrawals add column if not exists platform_fee numeric default 0;
alter table public.withdrawals add column if not exists net_amount numeric default 0;
alter table public.withdrawals add column if not exists method text default 'crypto';
alter table public.withdrawals add column if not exists wallet_address text;

create index if not exists withdrawals_user_id on public.withdrawals (user_id);
create index if not exists withdrawals_status on public.withdrawals (status);

-- ========== STRIPE_PAYMENTS ==========
create table if not exists public.stripe_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users (id) on delete set null,
  session_id text not null,
  amount numeric not null default 0,
  created_at timestamptz default now()
);

alter table public.stripe_payments add column if not exists email text;
alter table public.stripe_payments add column if not exists currency text default 'usd';
alter table public.stripe_payments add column if not exists status text default 'completed';
alter table public.stripe_payments add column if not exists stripe_session_id text;
alter table public.stripe_payments add column if not exists stripe_payment_intent_id text;
alter table public.stripe_payments add column if not exists stripe_payment_intent text;
alter table public.stripe_payments add column if not exists product_type text;

create index if not exists stripe_payments_user_id on public.stripe_payments (user_id);
create index if not exists stripe_payments_session_id on public.stripe_payments (session_id);
create unique index if not exists stripe_payments_session_unique on public.stripe_payments (session_id) where session_id is not null and session_id != '';

-- ========== REFERRALS (minimal; app also uses viral_referrals) ==========
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users (id) on delete cascade,
  referred_user_id uuid references public.users (id) on delete cascade,
  created_at timestamptz default now()
);

alter table public.referrals add column if not exists earnings numeric default 0;

create index if not exists referrals_user_id on public.referrals (user_id);
create index if not exists referrals_referred_user_id on public.referrals (referred_user_id);

-- ========== PROFIT ==========
create table if not exists public.profit (
  id uuid primary key default gen_random_uuid(),
  amount numeric default 0,
  created_at timestamptz default now()
);

-- ========== REVENUE ==========
create table if not exists public.revenue (
  id uuid primary key default gen_random_uuid(),
  amount numeric default 0,
  created_at timestamptz default now()
);

-- ========== WALLET (wallet_balances = source of truth for balance) ==========
create table if not exists public.wallet_balances (
  user_id uuid primary key references public.users (id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists wallet_balances_updated_at on public.wallet_balances (updated_at desc);

-- Optional: single-row wallet table if app expects "wallet"
create table if not exists public.wallet (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  balance numeric default 0,
  created_at timestamptz default now(),
  unique(user_id)
);

-- ========== SETTINGS ==========
create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  key text unique,
  value text,
  created_at timestamptz default now()
);

-- ========== INCREMENT_USER_BALANCE ==========
create or replace function public.increment_user_balance(uid uuid, amount numeric)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_balance numeric;
begin
  if uid is null then
    return null;
  end if;
  update public.users
  set balance = coalesce(balance, 0) + amount,
      updated_at = now()
  where id = uid
  returning balance into new_balance;
  if found then
    insert into public.wallet_balances (user_id, balance, updated_at)
    select uid, new_balance::bigint, now()
    on conflict (user_id) do update set
      balance = excluded.balance,
      updated_at = now();
    return new_balance;
  end if;
  return null;
end;
$$;

comment on function public.increment_user_balance is 'Increases user balance by amount; syncs wallet_balances. Returns new balance or null.';

-- ========== RLS (enable; service role bypasses) ==========
alter table public.users enable row level security;
alter table public.transactions enable row level security;
alter table public.withdrawals enable row level security;
alter table public.stripe_payments enable row level security;
alter table public.referrals enable row level security;
alter table public.profit enable row level security;
alter table public.revenue enable row level security;
alter table public.wallet_balances enable row level security;
alter table public.wallet enable row level security;
alter table public.settings enable row level security;

-- Policies: allow service_role full access; users read own data where applicable
drop policy if exists "Service role users" on public.users;
create policy "Service role users" on public.users for all using (auth.jwt() ->> 'role' = 'service_role');

drop policy if exists "Service role transactions" on public.transactions;
create policy "Service role transactions" on public.transactions for all using (auth.jwt() ->> 'role' = 'service_role');

drop policy if exists "Service role withdrawals" on public.withdrawals;
create policy "Service role withdrawals" on public.withdrawals for all using (auth.jwt() ->> 'role' = 'service_role');

drop policy if exists "Service role stripe_payments" on public.stripe_payments;
create policy "Service role stripe_payments" on public.stripe_payments for all using (auth.jwt() ->> 'role' = 'service_role');

drop policy if exists "Service role referrals" on public.referrals;
create policy "Service role referrals" on public.referrals for all using (auth.jwt() ->> 'role' = 'service_role');

drop policy if exists "Service role profit" on public.profit;
create policy "Service role profit" on public.profit for all using (auth.jwt() ->> 'role' = 'service_role');

drop policy if exists "Service role revenue" on public.revenue;
create policy "Service role revenue" on public.revenue for all using (auth.jwt() ->> 'role' = 'service_role');

drop policy if exists "Service role wallet_balances" on public.wallet_balances;
create policy "Service role wallet_balances" on public.wallet_balances for all using (auth.jwt() ->> 'role' = 'service_role');

drop policy if exists "Service role wallet" on public.wallet;
create policy "Service role wallet" on public.wallet for all using (auth.jwt() ->> 'role' = 'service_role');

drop policy if exists "Service role settings" on public.settings;
create policy "Service role settings" on public.settings for all using (auth.jwt() ->> 'role' = 'service_role');
