-- GarmonPay: profiles and referrals tables (command-specified schema), RLS, and safe defaults.
-- App continues to use public.users for dashboard; profiles is created for future use and compatibility.

-- 1) Profiles table (id = auth.users.id, balance/ad_credits/totals)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  balance numeric default 0,
  ad_credits numeric default 0,
  total_earned numeric default 0,
  total_withdrawn numeric default 0,
  created_at timestamptz default now()
);

create index if not exists profiles_email_idx on public.profiles (email);

-- Backfill profiles from existing users
insert into public.profiles (id, email, balance, ad_credits, total_earned, total_withdrawn, created_at)
select
  u.id,
  u.email,
  coalesce(u.balance, 0),
  coalesce(u.ad_credit_balance, 0),
  0,
  0,
  coalesce(u.created_at, now())
from public.users u
on conflict (id) do update set
  email = excluded.email,
  balance = excluded.balance,
  ad_credits = excluded.ad_credits,
  created_at = coalesce(public.profiles.created_at, excluded.created_at);

-- Trigger: create profile when new auth user is created (mirrors users trigger)
create or replace function public.handle_new_profile()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute procedure public.handle_new_profile();

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select using (auth.uid() = id);
create policy "Users can insert own profile"
  on public.profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);
create policy "Service role full access profiles"
  on public.profiles for all using (auth.jwt() ->> 'role' = 'service_role');

-- 2) Referrals table (user_id = referrer, referred_user_id = referred)
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete cascade,
  referred_user_id uuid references public.profiles (id) on delete cascade,
  earnings numeric default 0,
  created_at timestamptz default now()
);

create index if not exists referrals_user_id_idx on public.referrals (user_id);
create index if not exists referrals_referred_user_id_idx on public.referrals (referred_user_id);

alter table public.referrals enable row level security;

create policy "Users can view own referrals"
  on public.referrals for select using (auth.uid() = user_id);
create policy "Users can insert own referrals"
  on public.referrals for insert with check (auth.uid() = user_id);
create policy "Users can update own referrals"
  on public.referrals for update using (auth.uid() = user_id);
create policy "Service role full access referrals"
  on public.referrals for all using (auth.jwt() ->> 'role' = 'service_role');

-- 3) Ensure transactions exists and has RLS (already created in 20250218120000; reinforce policies)
alter table public.transactions enable row level security;
drop policy if exists "Users can read own transactions" on public.transactions;
create policy "Users can read own transactions"
  on public.transactions for select using (auth.uid() = user_id);
drop policy if exists "Service role full access transactions" on public.transactions;
create policy "Service role full access transactions"
  on public.transactions for all using (auth.jwt() ->> 'role' = 'service_role');

-- 4) Ensure users.referred_by_code exists (some migrations use it)
alter table public.users add column if not exists referred_by_code text;
