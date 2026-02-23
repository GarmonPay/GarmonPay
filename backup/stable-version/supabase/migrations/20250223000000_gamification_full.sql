-- GarmonPay: Full viral gamification with profit protection.
-- All rewards budget-controlled. Admin controls amounts and limits.

-- Extend transactions type for gamification rewards
alter table public.transactions drop constraint if exists transactions_type_check;
alter table public.transactions add constraint transactions_type_check
  check (type in (
    'earning', 'withdrawal', 'ad_credit', 'referral',
    'spin_wheel', 'mystery_box', 'streak', 'mission'
  ));

-- Extend platform_activities for new types
alter table public.platform_activities drop constraint if exists platform_activities_activity_type_check;
alter table public.platform_activities add constraint platform_activities_activity_type_check
  check (activity_type in (
    'joined', 'earned', 'withdrew', 'referral_bonus', 'daily_checkin',
    'spin_wheel', 'mystery_box', 'streak', 'mission'
  ));

-- ========== GLOBAL REWARD BUDGET (Phase 6) ==========
create table if not exists public.reward_budget_global (
  id text primary key default 'default',
  daily_budget_cents bigint not null default 10000,
  weekly_budget_cents bigint not null default 50000,
  daily_used_cents bigint not null default 0,
  weekly_used_cents bigint not null default 0,
  daily_reset_at date not null default current_date,
  weekly_reset_at date not null default (current_date - cast(extract(dow from current_date) as int)),
  updated_at timestamptz not null default now()
);

insert into public.reward_budget_global (id) values ('default') on conflict (id) do nothing;

-- Track all gamification reward spend for budget (same day/week)
create table if not exists public.reward_spend_log (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('spin_wheel', 'mystery_box', 'streak', 'mission')),
  amount_cents bigint not null,
  user_id uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists reward_spend_log_created_at on public.reward_spend_log (created_at desc);
create index if not exists reward_spend_log_source on public.reward_spend_log (source);

-- ========== SPIN WHEEL (Phase 1) ==========
create table if not exists public.spin_wheel_config (
  id text primary key default 'default',
  enabled boolean not null default true,
  daily_spin_limit_per_user int not null default 1,
  daily_total_budget_cents bigint not null default 5000,
  reward_balance_cents smallint[] not null default array[5, 10, 25, 0],
  reward_ad_credit_cents smallint[] not null default array[10, 20, 0, 0],
  no_reward_weight int not null default 1,
  updated_at timestamptz not null default now()
);

insert into public.spin_wheel_config (id) values ('default') on conflict (id) do nothing;

create table if not exists public.spin_wheel_spins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  spin_date date not null default current_date,
  reward_type text not null check (reward_type in ('balance', 'ad_credit', 'none')),
  amount_cents bigint not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists spin_wheel_spins_user_date_ord
  on public.spin_wheel_spins (user_id, spin_date, (created_at::text));

create index if not exists spin_wheel_spins_user_date on public.spin_wheel_spins (user_id, spin_date);

-- ========== MYSTERY BOX (Phase 2) ==========
create table if not exists public.mystery_box_config (
  id text primary key default 'default',
  enabled boolean not null default true,
  daily_total_budget_cents bigint not null default 3000,
  reward_types text[] not null default array['balance', 'ad_credit'],
  reward_balance_cents smallint[] not null default array[10, 25, 50],
  reward_ad_credit_cents smallint[] not null default array[20, 50],
  updated_at timestamptz not null default now()
);

insert into public.mystery_box_config (id) values ('default') on conflict (id) do nothing;

create table if not exists public.mystery_box_opens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  open_date date not null default current_date,
  reward_type text not null check (reward_type in ('balance', 'ad_credit', 'bonus')),
  amount_cents bigint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists mystery_box_opens_user_date on public.mystery_box_opens (user_id, open_date);

-- ========== DAILY STREAK (Phase 3) ==========
create table if not exists public.streak_config (
  id text primary key default 'default',
  enabled boolean not null default true,
  reward_per_day_cents bigint not null default 5,
  max_streak_reward_cents bigint not null default 100,
  daily_budget_cents bigint not null default 2000,
  updated_at timestamptz not null default now()
);

insert into public.streak_config (id) values ('default') on conflict (id) do nothing;

create table if not exists public.user_streaks (
  user_id uuid primary key references public.users (id) on delete cascade,
  last_login_date date,
  current_streak_days int not null default 0,
  updated_at timestamptz not null default now()
);

-- ========== MISSIONS (Phase 4) ==========
create table if not exists public.mission_config (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  reward_cents bigint not null default 0,
  daily_limit_per_user int not null default 1,
  daily_global_limit int default null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.mission_config (code, name, reward_cents, daily_limit_per_user) values
  ('watch_ad', 'Watch an ad', 15, 5),
  ('refer_user', 'Refer a user', 50, 10),
  ('login_daily', 'Login daily', 10, 1)
on conflict (code) do nothing;

create table if not exists public.mission_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  mission_code text not null references public.mission_config (code) on delete cascade,
  completed_date date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists mission_completions_user_date on public.mission_completions (user_id, completed_date);
create index if not exists mission_completions_mission_date on public.mission_completions (mission_code, completed_date);

-- ========== RANKS (Phase 5) ==========
create table if not exists public.rank_config (
  code text primary key,
  name text not null,
  sort_order int not null default 0,
  min_earnings_cents bigint not null default 0,
  min_referrals int not null default 0,
  earnings_multiplier numeric not null default 1.0,
  created_at timestamptz not null default now()
);

insert into public.rank_config (code, name, sort_order, min_earnings_cents, min_referrals, earnings_multiplier) values
  ('starter', 'Starter', 0, 0, 0, 1.0),
  ('pro', 'Pro', 1, 1000, 1, 1.1),
  ('elite', 'Elite', 2, 5000, 3, 1.2),
  ('vip', 'VIP', 3, 20000, 10, 1.3),
  ('legend', 'Legend', 4, 100000, 25, 1.5)
on conflict (code) do update set
  name = excluded.name,
  sort_order = excluded.sort_order,
  min_earnings_cents = excluded.min_earnings_cents,
  min_referrals = excluded.min_referrals,
  earnings_multiplier = excluded.earnings_multiplier;

-- Add rank to users if not exists (some schemas have membership_tier)
alter table public.users add column if not exists rank_code text default 'starter';

-- RLS
alter table public.reward_budget_global enable row level security;
alter table public.reward_spend_log enable row level security;
alter table public.spin_wheel_config enable row level security;
alter table public.spin_wheel_spins enable row level security;
alter table public.mystery_box_config enable row level security;
alter table public.mystery_box_opens enable row level security;
alter table public.streak_config enable row level security;
alter table public.user_streaks enable row level security;
alter table public.mission_config enable row level security;
alter table public.mission_completions enable row level security;
alter table public.rank_config enable row level security;

create policy "Service role reward_budget_global" on public.reward_budget_global for all using (auth.jwt() ->> 'role' = 'service_role');
create policy "Service role reward_spend_log" on public.reward_spend_log for all using (auth.jwt() ->> 'role' = 'service_role');
create policy "Service role spin_wheel_config" on public.spin_wheel_config for all using (auth.jwt() ->> 'role' = 'service_role');
create policy "Users read own spin_wheel_spins" on public.spin_wheel_spins for select using (auth.uid() = user_id);
create policy "Service role spin_wheel_spins" on public.spin_wheel_spins for all using (auth.jwt() ->> 'role' = 'service_role');
create policy "Service role mystery_box_config" on public.mystery_box_config for all using (auth.jwt() ->> 'role' = 'service_role');
create policy "Users read own mystery_box_opens" on public.mystery_box_opens for select using (auth.uid() = user_id);
create policy "Service role mystery_box_opens" on public.mystery_box_opens for all using (auth.jwt() ->> 'role' = 'service_role');
create policy "Service role streak_config" on public.streak_config for all using (auth.jwt() ->> 'role' = 'service_role');
create policy "Users read own user_streaks" on public.user_streaks for select using (auth.uid() = user_id);
create policy "Service role user_streaks" on public.user_streaks for all using (auth.jwt() ->> 'role' = 'service_role');
create policy "Service role mission_config" on public.mission_config for all using (auth.jwt() ->> 'role' = 'service_role');
create policy "Users read own mission_completions" on public.mission_completions for select using (auth.uid() = user_id);
create policy "Service role mission_completions" on public.mission_completions for all using (auth.jwt() ->> 'role' = 'service_role');
create policy "Service role rank_config" on public.rank_config for all using (auth.jwt() ->> 'role' = 'service_role');
create policy "Anyone read rank_config" on public.rank_config for select using (true);
