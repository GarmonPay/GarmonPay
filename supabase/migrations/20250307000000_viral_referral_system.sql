-- Viral referral system: viral_referrals table, referral_rewards, commission config defaults, gamification_rewards for free spin/pinball.

-- Drop and recreate viral_referrals so schema is correct (avoids "column referrer_user_id does not exist" if table existed with different columns).
drop table if exists public.gamification_rewards;
drop table if exists public.referral_rewards;
drop table if exists public.viral_referrals;

-- ========== VIRAL_REFERRALS (one row per referrer-referred pair; status lifecycle) ==========
create table public.viral_referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references public.users (id) on delete cascade,
  referred_user_id uuid not null references public.users (id) on delete cascade,
  referral_code text not null,
  status text not null default 'pending' check (status in ('pending', 'joined', 'deposited', 'subscribed')),
  created_at timestamptz not null default now(),
  unique(referred_user_id)
);

create index if not exists viral_referrals_referrer_user_id on public.viral_referrals (referrer_user_id);
create index if not exists viral_referrals_referral_code on public.viral_referrals (referral_code);
create index if not exists viral_referrals_status on public.viral_referrals (status);

comment on table public.viral_referrals is 'One row per referred user; status: pending -> joined -> deposited -> subscribed';

-- ========== REFERRAL_REWARDS (ledger of rewards paid) ==========
create table if not exists public.referral_rewards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  reward_type text not null check (reward_type in ('signup_bonus', 'deposit_bonus', 'subscription_commission')),
  amount numeric(12,2) not null default 0,
  referral_id uuid references public.viral_referrals (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists referral_rewards_user_id on public.referral_rewards (user_id);
create index if not exists referral_rewards_reward_type on public.referral_rewards (reward_type);

-- ========== COMMISSION CONFIG (UPSERT default tiers) ==========
-- Only insert if table has expected columns (avoids 42703 if table was created with different schema elsewhere).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'referral_commission_config' and column_name = 'membership_tier'
  ) then
    insert into public.referral_commission_config (membership_tier, commission_percentage, updated_at)
    values
      ('starter', 10, now()),
      ('pro', 25, now()),
      ('elite', 35, now()),
      ('vip', 50, now())
    on conflict (membership_tier) do update set
      commission_percentage = excluded.commission_percentage,
      updated_at = now();
  end if;
end;
$$;

-- ========== GAMIFICATION_REWARDS (free spin / free pinball per referral) ==========
create table if not exists public.gamification_rewards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  reward_type text not null check (reward_type in ('free_spin', 'free_pinball')),
  source text not null default 'referral' check (source in ('referral', 'promo', 'admin')),
  referral_id uuid references public.viral_referrals (id) on delete set null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists gamification_rewards_user_id on public.gamification_rewards (user_id);
create index if not exists gamification_rewards_reward_type on public.gamification_rewards (reward_type);
create index if not exists gamification_rewards_used on public.gamification_rewards (user_id, reward_type) where used_at is null;

-- ========== FRAUD: optional device/IP on viral_referrals ==========
alter table public.viral_referrals add column if not exists referrer_ip text;
alter table public.viral_referrals add column if not exists referred_ip text;
alter table public.viral_referrals add column if not exists device_fingerprint text;

-- RLS
alter table public.viral_referrals enable row level security;
alter table public.referral_rewards enable row level security;
alter table public.gamification_rewards enable row level security;

drop policy if exists "Service role viral_referrals" on public.viral_referrals;
create policy "Service role viral_referrals" on public.viral_referrals for all using (auth.jwt() ->> 'role' = 'service_role');
drop policy if exists "Users read own viral_referrals as referrer" on public.viral_referrals;
create policy "Users read own viral_referrals as referrer" on public.viral_referrals for select using (auth.uid() = referrer_user_id);

drop policy if exists "Service role referral_rewards" on public.referral_rewards;
create policy "Service role referral_rewards" on public.referral_rewards for all using (auth.jwt() ->> 'role' = 'service_role');
drop policy if exists "Users read own referral_rewards" on public.referral_rewards;
create policy "Users read own referral_rewards" on public.referral_rewards for select using (auth.uid() = user_id);

drop policy if exists "Service role gamification_rewards" on public.gamification_rewards;
create policy "Service role gamification_rewards" on public.gamification_rewards for all using (auth.jwt() ->> 'role' = 'service_role');
drop policy if exists "Users read own gamification_rewards" on public.gamification_rewards;
create policy "Users read own gamification_rewards" on public.gamification_rewards for select using (auth.uid() = user_id);
