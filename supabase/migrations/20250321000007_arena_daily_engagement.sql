-- Daily engagement: spin wheel tracking, referral bonus for arena (500 coins).
-- arena_daily_login already exists in arena_schema (day_streak, coins_earned).
-- arena_jackpot exists. Add arena_daily_spin for one free spin per day (extra with season pass handled in app).
alter table public.arena_daily_login add column if not exists claimed_at timestamptz default now();

create table if not exists public.arena_daily_spin (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  spin_date date not null,
  spins_used int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, spin_date)
);
create index if not exists arena_daily_spin_user_date on public.arena_daily_spin(user_id, spin_date);

-- Referrer gets 500 arena coins when referred user is created (we'll do this in API when referral is attached/synced).
create table if not exists public.arena_referral_bonus (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references public.users(id) on delete cascade,
  referred_user_id uuid not null references public.users(id) on delete cascade,
  coins_granted int not null default 500,
  created_at timestamptz default now(),
  unique(referred_user_id)
);
create index if not exists arena_referral_bonus_referrer on public.arena_referral_bonus(referrer_user_id);
