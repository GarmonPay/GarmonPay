-- =============================================================================
-- GarmonPay production audit repair
-- - Enforces required financial/admin schema
-- - Hardens Stripe idempotency indexes
-- - Standardizes transaction reference_id as text
-- - Makes wallet/deposit/withdrawal flows balance-safe
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Core users columns
-- ---------------------------------------------------------------------------
alter table if exists public.users add column if not exists email text;
alter table if exists public.users add column if not exists role text default 'user';
alter table if exists public.users add column if not exists is_super_admin boolean default false;
alter table if exists public.users add column if not exists balance numeric not null default 0;
alter table if exists public.users add column if not exists withdrawable_balance numeric not null default 0;
alter table if exists public.users add column if not exists pending_balance numeric not null default 0;
alter table if exists public.users add column if not exists total_deposits numeric not null default 0;
alter table if exists public.users add column if not exists ad_credit_balance numeric not null default 0;
alter table if exists public.users add column if not exists created_at timestamptz default now();
alter table if exists public.users add column if not exists updated_at timestamptz default now();

update public.users
set withdrawable_balance = coalesce(balance, 0)
where coalesce(withdrawable_balance, 0) = 0 and coalesce(balance, 0) > 0;

-- Harden users RLS (remove permissive policies from legacy repairs).
alter table if exists public.users enable row level security;
drop policy if exists "Allow all access" on public.users;
drop policy if exists "Users can read own row" on public.users;
drop policy if exists "Users can update own row" on public.users;
drop policy if exists "Service role full access" on public.users;
drop policy if exists "Allow user insert own profile" on public.users;
drop policy if exists "Allow user read own profile" on public.users;
drop policy if exists "Allow user update own profile" on public.users;
drop policy if exists "Users can read own profile" on public.users;
drop policy if exists "Users can insert own profile safe" on public.users;
drop policy if exists "Service role full access users" on public.users;
drop policy if exists "Authenticated can read users for leaderboard" on public.users;

create policy "Users can read own profile"
  on public.users
  for select
  to authenticated
  using (auth.uid() = id);

create policy "Authenticated can read users for leaderboard"
  on public.users
  for select
  to authenticated
  using (true);

create policy "Users can insert own profile safe"
  on public.users
  for insert
  to authenticated
  with check (
    auth.uid() = id
    and coalesce(is_super_admin, false) = false
    and coalesce(role, 'user') in ('user', 'member')
  );

create policy "Service role full access users"
  on public.users
  for all
  using (auth.jwt() ->> 'role' = 'service_role')
  with check (auth.jwt() ->> 'role' = 'service_role');

-- ---------------------------------------------------------------------------
-- Deposits table (Stripe + admin metrics)
-- ---------------------------------------------------------------------------
create table if not exists public.deposits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  amount numeric not null default 0,
  amount_cents bigint,
  status text default 'completed',
  stripe_session text,
  stripe_payment_intent text,
  created_at timestamptz default now()
);

alter table if exists public.deposits add column if not exists user_id uuid references public.users(id) on delete cascade;
alter table if exists public.deposits add column if not exists amount numeric not null default 0;
alter table if exists public.deposits add column if not exists amount_cents bigint;
alter table if exists public.deposits add column if not exists status text default 'completed';
alter table if exists public.deposits add column if not exists stripe_session text;
alter table if exists public.deposits add column if not exists stripe_payment_intent text;
alter table if exists public.deposits add column if not exists created_at timestamptz default now();

-- Backfill amount_cents if missing.
update public.deposits
set amount_cents = round(coalesce(amount, 0) * 100)::bigint
where amount_cents is null;

create unique index if not exists deposits_stripe_session_unique
  on public.deposits (stripe_session)
  where stripe_session is not null;

-- ---------------------------------------------------------------------------
-- Transactions table + columns
-- ---------------------------------------------------------------------------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null,
  amount numeric not null default 0,
  status text not null default 'pending',
  description text,
  reference_id text,
  created_at timestamptz not null default now()
);

alter table if exists public.transactions add column if not exists user_id uuid references public.users(id) on delete cascade;
alter table if exists public.transactions add column if not exists type text;
alter table if exists public.transactions add column if not exists amount numeric default 0;
alter table if exists public.transactions add column if not exists status text default 'pending';
alter table if exists public.transactions add column if not exists description text;
alter table if exists public.transactions add column if not exists reference_id text;
alter table if exists public.transactions add column if not exists created_at timestamptz default now();

-- reference_id must be text (Stripe session ids are not UUID).
do $$
declare
  reference_type text;
begin
  select data_type into reference_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'transactions'
    and column_name = 'reference_id';

  if reference_type is not null and reference_type <> 'text' then
    execute 'alter table public.transactions alter column reference_id type text using reference_id::text';
  end if;
end $$;

alter table public.transactions drop constraint if exists transactions_type_check;
alter table public.transactions add constraint transactions_type_check
  check (type in (
    'earning', 'withdrawal', 'ad_credit', 'referral', 'referral_commission',
    'spin_wheel', 'scratch_card', 'mystery_box', 'streak', 'mission',
    'tournament_entry', 'tournament_prize', 'team_prize',
    'fight_entry', 'fight_prize',
    'boxing_entry', 'boxing_prize', 'boxing_bet', 'boxing_bet_payout',
    'deposit'
  ));

alter table public.transactions drop constraint if exists transactions_status_check;
alter table public.transactions add constraint transactions_status_check
  check (status in ('pending', 'completed', 'rejected', 'cancelled'));

create index if not exists transactions_reference_id_idx on public.transactions(reference_id);

-- ---------------------------------------------------------------------------
-- Withdrawals + admin logs
-- ---------------------------------------------------------------------------
alter table if exists public.withdrawals add column if not exists platform_fee numeric not null default 0;
alter table if exists public.withdrawals add column if not exists net_amount numeric not null default 0;
alter table if exists public.withdrawals add column if not exists processed_at timestamptz;
alter table if exists public.withdrawals add column if not exists ip_address text;
alter table if exists public.withdrawals add column if not exists updated_at timestamptz default now();

create table if not exists public.admin_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  admin_id uuid references public.users(id) on delete set null,
  target_user_id uuid references public.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table if exists public.admin_logs add column if not exists action text;
alter table if exists public.admin_logs add column if not exists admin_id uuid references public.users(id) on delete set null;
alter table if exists public.admin_logs add column if not exists target_user_id uuid references public.users(id) on delete set null;
alter table if exists public.admin_logs add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table if exists public.admin_logs add column if not exists created_at timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- Stripe idempotency indexes
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.stripe_payments') is not null then
    execute 'create unique index if not exists stripe_payments_session_unique
      on public.stripe_payments (stripe_session_id)
      where stripe_session_id is not null';
    execute 'create unique index if not exists stripe_payments_payment_intent_unique
      on public.stripe_payments (stripe_payment_intent_id)
      where stripe_payment_intent_id is not null';
  end if;
end $$;

create table if not exists public.platform_revenue (
  id uuid primary key default gen_random_uuid(),
  amount numeric not null default 0,
  source text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Wallet/deposit helpers
-- ---------------------------------------------------------------------------
create or replace function public.increment_user_balance(
  p_user_id uuid,
  p_amount_cents bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_amount_cents is null or p_amount_cents <= 0 then
    return;
  end if;

  update public.users
  set
    balance = coalesce(balance, 0) + p_amount_cents,
    withdrawable_balance = coalesce(withdrawable_balance, 0) + p_amount_cents,
    total_deposits = coalesce(total_deposits, 0) + p_amount_cents,
    updated_at = now()
  where id = p_user_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Safe withdrawal lifecycle
-- ---------------------------------------------------------------------------
create or replace function public.request_withdrawal(
  p_user_id uuid,
  p_amount_cents bigint,
  p_method text,
  p_wallet_address text,
  p_ip_address text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance numeric;
  v_withdrawable numeric;
  v_platform_fee numeric;
  v_net_amount numeric;
  v_row public.withdrawals%rowtype;
  v_today_count int;
  v_last_created timestamptz;
  min_cents bigint := 1000;
  max_per_day int := 3;
  cooldown_min interval := interval '5 minutes';
begin
  if p_amount_cents is null or p_amount_cents < min_cents then
    return jsonb_build_object('success', false, 'message', 'Minimum withdrawal is $10.00');
  end if;
  if p_method is null or p_method not in ('crypto', 'paypal', 'bank') then
    return jsonb_build_object('success', false, 'message', 'Invalid method');
  end if;
  if p_wallet_address is null or trim(p_wallet_address) = '' then
    return jsonb_build_object('success', false, 'message', 'Wallet address required');
  end if;

  select balance, withdrawable_balance
    into v_balance, v_withdrawable
  from public.users
  where id = p_user_id
  for update;

  if v_balance is null then
    return jsonb_build_object('success', false, 'message', 'User not found');
  end if;
  if coalesce(v_withdrawable, 0) < p_amount_cents then
    return jsonb_build_object('success', false, 'message', 'Insufficient withdrawable balance');
  end if;
  if coalesce(v_balance, 0) < p_amount_cents then
    return jsonb_build_object('success', false, 'message', 'Insufficient balance');
  end if;

  select count(*) into v_today_count
  from public.withdrawals
  where user_id = p_user_id
    and created_at >= date_trunc('day', now())
    and status in ('pending', 'approved', 'paid');
  if v_today_count >= max_per_day then
    return jsonb_build_object('success', false, 'message', 'Maximum 3 withdrawals per day. Try again tomorrow.');
  end if;

  select max(created_at) into v_last_created
  from public.withdrawals
  where user_id = p_user_id
    and status in ('pending', 'approved', 'paid');
  if v_last_created is not null and (now() - v_last_created) < cooldown_min then
    return jsonb_build_object('success', false, 'message', 'Please wait 5 minutes between withdrawal requests.');
  end if;

  v_platform_fee := round(p_amount_cents * 0.10);
  v_net_amount := p_amount_cents - v_platform_fee;

  update public.users
  set
    balance = coalesce(balance, 0) - p_amount_cents,
    withdrawable_balance = coalesce(withdrawable_balance, 0) - p_amount_cents,
    pending_balance = coalesce(pending_balance, 0) + p_amount_cents,
    updated_at = now()
  where id = p_user_id;

  insert into public.withdrawals (
    user_id, amount, platform_fee, net_amount, status, method, wallet_address, ip_address, updated_at
  )
  values (
    p_user_id,
    p_amount_cents,
    v_platform_fee,
    v_net_amount,
    'pending',
    p_method,
    trim(p_wallet_address),
    nullif(trim(coalesce(p_ip_address, '')), ''),
    now()
  )
  returning * into v_row;

  insert into public.transactions (user_id, type, amount, status, description, reference_id, created_at)
  values (p_user_id, 'withdrawal', p_amount_cents, 'pending', 'Withdrawal request', v_row.id::text, now());

  return jsonb_build_object(
    'success', true,
    'withdrawal', jsonb_build_object(
      'id', v_row.id,
      'amount', v_row.amount,
      'platform_fee', v_row.platform_fee,
      'net_amount', v_row.net_amount,
      'status', v_row.status,
      'method', v_row.method,
      'wallet_address', v_row.wallet_address,
      'created_at', v_row.created_at
    )
  );
end;
$$;

create or replace function public.reject_withdrawal(p_withdrawal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.withdrawals%rowtype;
begin
  select * into v_row
  from public.withdrawals
  where id = p_withdrawal_id
  for update;

  if v_row is null then
    return jsonb_build_object('success', false, 'message', 'Withdrawal not found');
  end if;
  if v_row.status != 'pending' then
    return jsonb_build_object('success', false, 'message', 'Only pending withdrawals can be rejected');
  end if;

  update public.users
  set
    balance = coalesce(balance, 0) + coalesce(v_row.amount, 0),
    withdrawable_balance = coalesce(withdrawable_balance, 0) + coalesce(v_row.amount, 0),
    pending_balance = greatest(0, coalesce(pending_balance, 0) - coalesce(v_row.amount, 0)),
    updated_at = now()
  where id = v_row.user_id;

  update public.withdrawals
  set status = 'rejected', processed_at = now(), updated_at = now()
  where id = p_withdrawal_id;

  update public.transactions
  set status = 'rejected',
      description = 'Withdrawal rejected - balance refunded'
  where reference_id = p_withdrawal_id::text
    and type = 'withdrawal';

  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.approve_withdrawal(p_withdrawal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.withdrawals%rowtype;
begin
  select * into v_row
  from public.withdrawals
  where id = p_withdrawal_id
  for update;

  if v_row is null then
    return jsonb_build_object('success', false, 'message', 'Withdrawal not found');
  end if;
  if v_row.status != 'pending' then
    return jsonb_build_object('success', false, 'message', 'Only pending withdrawals can be approved');
  end if;

  update public.withdrawals
  set status = 'approved', processed_at = now(), updated_at = now()
  where id = p_withdrawal_id;

  update public.users
  set
    pending_balance = greatest(0, coalesce(pending_balance, 0) - coalesce(v_row.amount, 0)),
    updated_at = now()
  where id = v_row.user_id;

  if coalesce(v_row.platform_fee, 0) > 0 then
    insert into public.platform_revenue (amount, source)
    values (v_row.platform_fee, 'withdrawal_fee');
  end if;

  return jsonb_build_object('success', true);
end;
$$;
