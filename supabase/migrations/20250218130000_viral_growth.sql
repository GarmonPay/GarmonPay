-- GarmonPay: viral growth — referral bonuses, daily rewards, badges, activity feed.

-- Referral bonuses: one per (referrer, referred) to prevent duplicate rewards
create table if not exists public.referral_bonus (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.users (id) on delete cascade,
  referred_user_id uuid not null references public.users (id) on delete cascade,
  amount bigint not null default 0,
  status text not null default 'paid' check (status in ('pending', 'paid', 'reversed')),
  created_at timestamptz not null default now(),
  unique(referred_user_id)
);

create index if not exists referral_bonus_referrer_id on public.referral_bonus (referrer_id);

-- Daily rewards: one row per user
create table if not exists public.daily_rewards (
  user_id uuid primary key references public.users (id) on delete cascade,
  last_claim_date date,
  reward_amount bigint not null default 0,
  updated_at timestamptz not null default now()
);

-- Badges definition
create table if not exists public.badges (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  description text default '',
  icon text default '',
  created_at timestamptz not null default now()
);

-- User earned badges
create table if not exists public.user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  badge_id uuid not null references public.badges (id) on delete cascade,
  earned_at timestamptz not null default now(),
  unique(user_id, badge_id)
);

create index if not exists user_badges_user_id on public.user_badges (user_id);

-- Platform activity feed (for live feed)
create table if not exists public.platform_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users (id) on delete set null,
  activity_type text not null check (activity_type in ('joined', 'earned', 'withdrew', 'referral_bonus', 'daily_checkin')),
  description text not null default '',
  amount_cents bigint,
  created_at timestamptz not null default now()
);

create index if not exists platform_activities_created_at on public.platform_activities (created_at desc);

-- Seed badges
insert into public.badges (code, name, description, icon) values
  ('first_earnings', 'First Earnings', 'Earned your first reward', '💰'),
  ('first_withdrawal', 'First Withdrawal', 'Completed your first withdrawal', '🏦'),
  ('top_referrer', 'Top Referrer', 'Ranked in top 10 referrers', '🏆'),
  ('vip_member', 'VIP Member', 'VIP membership tier', '👑')
on conflict (code) do nothing;

-- RLS
alter table public.referral_bonus enable row level security;
alter table public.daily_rewards enable row level security;
alter table public.user_badges enable row level security;
alter table public.platform_activities enable row level security;

create policy "Service role referral_bonus" on public.referral_bonus for all using (auth.jwt() ->> 'role' = 'service_role');
create policy "Users read own daily_rewards" on public.daily_rewards for select using (auth.uid() = user_id);
create policy "Service role daily_rewards" on public.daily_rewards for all using (auth.jwt() ->> 'role' = 'service_role');
create policy "Users read own user_badges" on public.user_badges for select using (auth.uid() = user_id);
create policy "Service role user_badges" on public.user_badges for all using (auth.jwt() ->> 'role' = 'service_role');
create policy "Anyone read platform_activities" on public.platform_activities for select using (true);
create policy "Service role platform_activities" on public.platform_activities for all using (auth.jwt() ->> 'role' = 'service_role');

-- Record "joined" when new user is created (public.users)
create or replace function public.record_user_joined()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.platform_activities (user_id, activity_type, description)
  values (new.id, 'joined', 'Joined GarmonPay');
  return new;
end;
$$;
drop trigger if exists on_user_joined on public.users;
create trigger on_user_joined after insert on public.users
  for each row execute procedure public.record_user_joined();

-- Backfill joined activities for existing users
insert into public.platform_activities (user_id, activity_type, description)
select id, 'joined', 'Joined GarmonPay' from public.users u
where not exists (select 1 from public.platform_activities where user_id = u.id and activity_type = 'joined');

-- Grant referral bonus when referred user is "verified" (one-time per referred user). Call from app after signup/verification.
create or replace function public.grant_referral_bonus_for_user(p_referred_user_id uuid, p_bonus_cents bigint default 50)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_referred record;
  v_referrer_id uuid;
begin
  if p_bonus_cents is null or p_bonus_cents <= 0 then
    return jsonb_build_object('success', false, 'message', 'Invalid bonus amount');
  end if;
  select id, referred_by_code into v_referred from public.users where id = p_referred_user_id;
  if v_referred is null or v_referred.referred_by_code is null or trim(v_referred.referred_by_code) = '' then
    return jsonb_build_object('success', false, 'message', 'No referrer');
  end if;
  select id into v_referrer_id from public.users where referral_code = v_referred.referred_by_code;
  if v_referrer_id is null then
    return jsonb_build_object('success', false, 'message', 'Referrer not found');
  end if;
  if v_referrer_id = p_referred_user_id then
    return jsonb_build_object('success', false, 'message', 'Cannot self-refer');
  end if;
  -- Prevent duplicate: unique on referred_user_id
  insert into public.referral_bonus (referrer_id, referred_user_id, amount, status)
  values (v_referrer_id, p_referred_user_id, p_bonus_cents, 'paid')
  on conflict (referred_user_id) do nothing;
  if not found then
    return jsonb_build_object('success', false, 'message', 'Bonus already granted');
  end if;
  update public.users set balance = balance + p_bonus_cents, updated_at = now() where id = v_referrer_id;
  insert into public.transactions (user_id, type, amount, status, description, reference_id)
  values (v_referrer_id, 'referral', p_bonus_cents, 'completed', 'Referral bonus', (select id from public.referral_bonus where referred_user_id = p_referred_user_id limit 1));
  insert into public.earnings (user_id, amount, source, reference_id)
  values (v_referrer_id, p_bonus_cents, 'referral', (select id from public.referral_bonus where referred_user_id = p_referred_user_id limit 1));
  insert into public.platform_activities (user_id, activity_type, description, amount_cents)
  values (v_referrer_id, 'referral_bonus', 'Referral bonus earned', p_bonus_cents);
  return jsonb_build_object('success', true, 'referrer_id', v_referrer_id);
end;
$$;

-- Daily check-in: claim once per calendar day
create or replace function public.claim_daily_reward(p_user_id uuid, p_reward_cents bigint default 25)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := current_date;
  v_last date;
begin
  if p_reward_cents is null or p_reward_cents <= 0 then
    return jsonb_build_object('success', false, 'message', 'Invalid reward');
  end if;
  select last_claim_date into v_last from public.daily_rewards where user_id = p_user_id;
  if v_last is not null and v_last >= v_today then
    return jsonb_build_object('success', false, 'message', 'Already claimed today');
  end if;
  insert into public.daily_rewards (user_id, last_claim_date, reward_amount, updated_at)
  values (p_user_id, v_today, p_reward_cents, now())
  on conflict (user_id) do update set
    last_claim_date = v_today,
    reward_amount = p_reward_cents,
    updated_at = now();
  update public.users set balance = balance + p_reward_cents, updated_at = now() where id = p_user_id;
  insert into public.transactions (user_id, type, amount, status, description)
  values (p_user_id, 'earning', p_reward_cents, 'completed', 'Daily check-in reward');
  insert into public.earnings (user_id, amount, source) values (p_user_id, p_reward_cents, 'ad');
  insert into public.platform_activities (user_id, activity_type, description, amount_cents)
  values (p_user_id, 'daily_checkin', 'Daily check-in', p_reward_cents);
  return jsonb_build_object('success', true, 'amountCents', p_reward_cents);
end;
$$;
