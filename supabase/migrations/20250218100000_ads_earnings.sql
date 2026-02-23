-- GarmonPay: ads, ad_sessions, earnings, ad media bucket.
-- Storage bucket for ad media (video/image). Create via API or Dashboard if not exists.
-- insert into storage.buckets (id, name, public) values ('ad-media', 'ad-media', true)
-- on conflict (id) do nothing;
-- Ads: admin-controlled pricing (advertiser_price, user_reward, profit_amount).
-- Earnings: ledger for user earnings (ad, referral). Balance lives on public.users.

-- Ads table
create table if not exists public.ads (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text default '',
  type text not null check (type in ('video', 'image', 'text', 'link')),
  media_url text,
  advertiser_price bigint not null default 0,
  user_reward bigint not null default 0,
  profit_amount bigint not null default 0,
  duration_seconds int not null default 5 check (duration_seconds >= 1),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now()
);

create index if not exists ads_status_idx on public.ads (status);
create index if not exists ads_created_at_idx on public.ads (created_at desc);

comment on column public.ads.advertiser_price is 'Amount advertiser pays (cents)';
comment on column public.ads.user_reward is 'Amount user receives on completion (cents)';
comment on column public.ads.profit_amount is 'advertiser_price - user_reward (cents)';

-- Ad sessions: one per watch attempt
create table if not exists public.ad_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  ad_id uuid not null references public.ads (id) on delete cascade,
  start_time timestamptz not null default now(),
  completed boolean not null default false,
  reward_given boolean not null default false
);

create index if not exists ad_sessions_user_id on public.ad_sessions (user_id);
create index if not exists ad_sessions_ad_id on public.ad_sessions (ad_id);
create index if not exists ad_sessions_user_ad on public.ad_sessions (user_id, ad_id);

-- Earnings ledger (ad, referral)
create table if not exists public.earnings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  amount bigint not null,
  source text not null check (source in ('ad', 'referral')),
  reference_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists earnings_user_id on public.earnings (user_id);
create index if not exists earnings_created_at on public.earnings (created_at desc);
create index if not exists earnings_source on public.earnings (source);

-- RLS: ads readable by all authenticated (list active only in app logic)
alter table public.ads enable row level security;
create policy "Ads readable when authenticated"
  on public.ads for select
  using (auth.uid() is not null);

-- Only service role can insert/update/delete ads (admin API)
create policy "Service role full access ads"
  on public.ads for all
  using (auth.jwt() ->> 'role' = 'service_role');

-- ad_sessions: users can insert own (start), select own; service updates (complete)
alter table public.ad_sessions enable row level security;
create policy "Users can insert own ad_sessions"
  on public.ad_sessions for insert
  with check (auth.uid() = user_id);
create policy "Users can select own ad_sessions"
  on public.ad_sessions for select
  using (auth.uid() = user_id);
create policy "Service role full access ad_sessions"
  on public.ad_sessions for all
  using (auth.jwt() ->> 'role' = 'service_role');

-- earnings: users can read own; only service role can insert (backend reward)
alter table public.earnings enable row level security;
create policy "Users can read own earnings"
  on public.earnings for select
  using (auth.uid() = user_id);
create policy "Service role full access earnings"
  on public.earnings for all
  using (auth.jwt() ->> 'role' = 'service_role');

-- Complete ad session and issue reward (run as service role). Prevents duplicate reward.
create or replace function public.complete_ad_session_and_issue_reward(
  p_user_id uuid,
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session record;
  v_ad record;
  v_reward bigint;
begin
  select * into v_session from public.ad_sessions where id = p_session_id;
  if v_session is null then
    return jsonb_build_object('success', false, 'message', 'Invalid session');
  end if;
  if v_session.user_id != p_user_id then
    return jsonb_build_object('success', false, 'message', 'Unauthorized');
  end if;
  if v_session.reward_given then
    return jsonb_build_object('success', false, 'message', 'Reward already issued');
  end if;

  if (v_session.start_time + (select duration_seconds from public.ads where id = v_session.ad_id) * interval '1 second') > now() then
    return jsonb_build_object('success', false, 'message', 'Timer not complete');
  end if;

  select * into v_ad from public.ads where id = v_session.ad_id;
  if v_ad is null then
    return jsonb_build_object('success', false, 'message', 'Ad not found');
  end if;

  v_reward := v_ad.user_reward;

  update public.ad_sessions set completed = true, reward_given = true where id = p_session_id;

  update public.users set balance = balance + v_reward, updated_at = now() where id = p_user_id;

  insert into public.earnings (user_id, amount, source, reference_id)
  values (p_user_id, v_reward, 'ad', p_session_id);

  return jsonb_build_object('success', true, 'rewardCents', v_reward);
end;
$$;
