-- Profit-protected games: games_rewards log + reward_budget (daily cap).
-- Rewards come from platform reward_budget only.

-- Allow scratch_card in transactions
alter table public.transactions drop constraint if exists transactions_type_check;
alter table public.transactions add constraint transactions_type_check
  check (type in (
    'earning', 'withdrawal', 'ad_credit', 'referral',
    'spin_wheel', 'scratch_card', 'mystery_box', 'streak', 'mission'
  ));

-- Games rewards log (each game payout)
create table if not exists public.games_rewards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  game_type text not null check (game_type in ('spin_wheel', 'scratch_card', 'mystery_box', 'daily_bonus')),
  reward_amount numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists games_rewards_user_id on public.games_rewards (user_id);
create index if not exists games_rewards_created_at on public.games_rewards (created_at desc);
create index if not exists games_rewards_game_type on public.games_rewards (game_type);

-- Daily reward budget (single row). If daily_used >= daily_limit, stop rewards.
create table if not exists public.reward_budget (
  id text primary key default 'default',
  daily_limit numeric not null default 10000,
  daily_used numeric not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.reward_budget (id, daily_limit, daily_used) values ('default', 10000, 0)
on conflict (id) do nothing;

-- Reset daily_used at start of new day (trigger or app logic). App will reset when date changes.
alter table public.reward_budget enable row level security;
create policy "Service role reward_budget" on public.reward_budget for all using (auth.jwt() ->> 'role' = 'service_role');

comment on table public.games_rewards is 'Log of all game payouts for audit and duplicate prevention';
comment on table public.reward_budget is 'Platform daily reward cap; rewards stop when daily_used >= daily_limit';
