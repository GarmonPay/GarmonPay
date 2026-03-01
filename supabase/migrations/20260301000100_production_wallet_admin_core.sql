-- Production wallet/admin core hardening:
-- 1) Ensure users.total_deposits exists
-- 2) Ensure transactions table exists with required core columns
-- 3) Ensure transactions type/status constraints include admin_credit/deposit flows

alter table public.users
  add column if not exists total_deposits bigint not null default 0;

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  amount bigint not null default 0,
  type text not null default 'adjustment',
  status text not null default 'completed',
  created_at timestamptz not null default now()
);

alter table public.transactions
  add column if not exists id uuid default gen_random_uuid();

alter table public.transactions
  add column if not exists user_id uuid references public.users(id) on delete cascade;

alter table public.transactions
  add column if not exists amount bigint not null default 0;

alter table public.transactions
  add column if not exists type text not null default 'adjustment';

alter table public.transactions
  add column if not exists status text not null default 'completed';

alter table public.transactions
  add column if not exists created_at timestamptz not null default now();

-- Optional columns used by API handlers for richer audit logs.
alter table public.transactions
  add column if not exists description text;

alter table public.transactions
  add column if not exists reference_id text;

create index if not exists transactions_user_id_idx on public.transactions(user_id);
create index if not exists transactions_created_at_idx on public.transactions(created_at desc);
create index if not exists transactions_type_idx on public.transactions(type);
create index if not exists transactions_reference_id_idx on public.transactions(reference_id);

alter table public.transactions drop constraint if exists transactions_type_check;
alter table public.transactions add constraint transactions_type_check
  check (
    type in (
      'deposit',
      'admin_credit',
      'withdrawal',
      'earning',
      'ad_credit',
      'referral',
      'referral_commission',
      'spin_wheel',
      'scratch_card',
      'mystery_box',
      'streak',
      'mission',
      'tournament_entry',
      'tournament_prize',
      'team_prize',
      'fight_entry',
      'fight_prize',
      'boxing_entry',
      'boxing_prize',
      'boxing_bet',
      'boxing_bet_payout',
      'bonus',
      'profit',
      'reward',
      'daily_bonus',
      'adjustment'
    )
  );

alter table public.transactions drop constraint if exists transactions_status_check;
alter table public.transactions add constraint transactions_status_check
  check (status in ('pending', 'completed', 'rejected', 'cancelled', 'failed'));
