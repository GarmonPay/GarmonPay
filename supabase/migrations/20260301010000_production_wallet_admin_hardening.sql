-- Production hardening: wallet aggregates, admin auditing, and secure server-side wallet adjustment RPC.

-- -----------------------------------------------------------------------------
-- USERS: wallet aggregate + suspension fields
-- -----------------------------------------------------------------------------
alter table public.users add column if not exists total_deposits bigint not null default 0;
alter table public.users add column if not exists total_withdrawals bigint not null default 0;
alter table public.users add column if not exists total_earnings bigint not null default 0;
alter table public.users add column if not exists withdrawable_balance bigint not null default 0;
alter table public.users add column if not exists pending_balance bigint not null default 0;
alter table public.users add column if not exists lifetime_earnings bigint not null default 0;
alter table public.users add column if not exists is_banned boolean not null default false;
alter table public.users add column if not exists banned_at timestamptz;
alter table public.users add column if not exists banned_reason text;
alter table public.users add column if not exists updated_at timestamptz not null default now();

update public.users
set
  total_deposits = coalesce(total_deposits, 0),
  total_withdrawals = coalesce(total_withdrawals, 0),
  total_earnings = coalesce(total_earnings, 0),
  withdrawable_balance = coalesce(withdrawable_balance, coalesce(balance::bigint, 0)),
  pending_balance = coalesce(pending_balance, 0),
  lifetime_earnings = coalesce(lifetime_earnings, coalesce(total_earnings, 0))
where true;

create index if not exists users_is_banned_idx on public.users (is_banned);

-- -----------------------------------------------------------------------------
-- ADMIN LOGS: extended audit payload (backward compatible with old schema)
-- -----------------------------------------------------------------------------
create table if not exists public.admin_logs (
  id uuid default gen_random_uuid() primary key,
  action text not null,
  admin_id uuid references public.users(id) on delete set null,
  created_at timestamptz default now()
);

alter table public.admin_logs add column if not exists target_user_id uuid references public.users(id) on delete set null;
alter table public.admin_logs add column if not exists amount_cents bigint;
alter table public.admin_logs add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists admin_logs_admin_id_idx on public.admin_logs (admin_id);
create index if not exists admin_logs_target_user_id_idx on public.admin_logs (target_user_id);
create index if not exists admin_logs_created_at_idx on public.admin_logs (created_at desc);

alter table public.admin_logs enable row level security;
drop policy if exists "Service role full access admin_logs" on public.admin_logs;
create policy "Service role full access admin_logs"
  on public.admin_logs for all
  using (auth.jwt() ->> 'role' = 'service_role');

-- -----------------------------------------------------------------------------
-- DEPOSITS: status + uniqueness for Stripe idempotency
-- -----------------------------------------------------------------------------
alter table public.deposits add column if not exists status text default 'completed';
alter table public.deposits add column if not exists stripe_session text;
create unique index if not exists deposits_stripe_session_unique
  on public.deposits (stripe_session)
  where stripe_session is not null;

-- -----------------------------------------------------------------------------
-- EARNINGS: ad reward tracking fields requested for rewarded-ads analytics
-- -----------------------------------------------------------------------------
alter table public.earnings add column if not exists reward_amount bigint;
alter table public.earnings add column if not exists ad_views integer not null default 1;

alter table public.earnings drop constraint if exists earnings_source_check;
alter table public.earnings add constraint earnings_source_check
  check (source in ('ad', 'ad_view', 'referral', 'bonus', 'manual')) not valid;

-- -----------------------------------------------------------------------------
-- TRANSACTIONS: allow adjustment type for admin manual credits/debits
-- -----------------------------------------------------------------------------
alter table public.transactions drop constraint if exists transactions_type_check;
alter table public.transactions add constraint transactions_type_check
  check (type in (
    'earning', 'withdrawal', 'ad_credit', 'referral', 'referral_commission',
    'spin_wheel', 'scratch_card', 'mystery_box', 'streak', 'mission',
    'tournament_entry', 'tournament_prize', 'team_prize',
    'fight_entry', 'fight_prize',
    'boxing_entry', 'boxing_prize', 'boxing_bet', 'boxing_bet_payout',
    'deposit', 'adjustment'
  )) not valid;

-- -----------------------------------------------------------------------------
-- ATOMIC WALLET ADJUSTMENT RPC
-- -----------------------------------------------------------------------------
create or replace function public.apply_wallet_adjustment(
  p_user_id uuid,
  p_amount_cents bigint,
  p_direction text,          -- 'credit' or 'debit'
  p_track text default 'none', -- 'deposit' | 'withdrawal' | 'earning' | 'none'
  p_affect_withdrawable boolean default true,
  p_allow_negative boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user public.users%rowtype;
  v_signed bigint;
  v_balance bigint;
  v_withdrawable bigint;
  v_total_deposits bigint;
  v_total_withdrawals bigint;
  v_total_earnings bigint;
begin
  if p_user_id is null then
    return jsonb_build_object('success', false, 'message', 'p_user_id required');
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    return jsonb_build_object('success', false, 'message', 'p_amount_cents must be > 0');
  end if;
  if p_direction not in ('credit', 'debit') then
    return jsonb_build_object('success', false, 'message', 'p_direction must be credit|debit');
  end if;
  if p_track not in ('deposit', 'withdrawal', 'earning', 'none') then
    return jsonb_build_object('success', false, 'message', 'invalid p_track');
  end if;

  select * into v_user
  from public.users
  where id = p_user_id
  for update;

  if v_user is null then
    return jsonb_build_object('success', false, 'message', 'User not found');
  end if;
  if coalesce(v_user.is_banned, false) then
    return jsonb_build_object('success', false, 'message', 'User is banned');
  end if;

  v_signed := case when p_direction = 'credit' then p_amount_cents else -p_amount_cents end;

  v_balance := coalesce(v_user.balance::bigint, 0) + v_signed;
  if not p_allow_negative and v_balance < 0 then
    return jsonb_build_object('success', false, 'message', 'Insufficient balance');
  end if;

  v_withdrawable := coalesce(v_user.withdrawable_balance::bigint, coalesce(v_user.balance::bigint, 0));
  if p_affect_withdrawable then
    v_withdrawable := greatest(0, v_withdrawable + v_signed);
  end if;

  v_total_deposits := coalesce(v_user.total_deposits::bigint, 0);
  v_total_withdrawals := coalesce(v_user.total_withdrawals::bigint, 0);
  v_total_earnings := coalesce(v_user.total_earnings::bigint, 0);

  if p_track = 'deposit' then
    v_total_deposits := greatest(0, v_total_deposits + (case when p_direction = 'credit' then p_amount_cents else -p_amount_cents end));
  elsif p_track = 'withdrawal' then
    v_total_withdrawals := greatest(0, v_total_withdrawals + (case when p_direction = 'credit' then p_amount_cents else -p_amount_cents end));
  elsif p_track = 'earning' then
    v_total_earnings := greatest(0, v_total_earnings + (case when p_direction = 'credit' then p_amount_cents else -p_amount_cents end));
  end if;

  update public.users
  set
    balance = v_balance,
    withdrawable_balance = v_withdrawable,
    total_deposits = v_total_deposits,
    total_withdrawals = v_total_withdrawals,
    total_earnings = v_total_earnings,
    lifetime_earnings = greatest(coalesce(lifetime_earnings::bigint, 0), v_total_earnings),
    updated_at = now()
  where id = p_user_id;

  return jsonb_build_object(
    'success', true,
    'balanceCents', v_balance,
    'withdrawableCents', v_withdrawable
  );
end;
$$;
