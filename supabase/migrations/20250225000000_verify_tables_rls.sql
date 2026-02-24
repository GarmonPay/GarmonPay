-- GarmonPay: Verify required tables exist, add missing columns, ensure RLS for authenticated read.
-- Required tables: users, teams, tournaments, referrals, earnings, withdrawals.

-- 1) Users: add leaderboard cache columns if missing (for anon/client leaderboard query)
alter table public.users
  add column if not exists total_earnings bigint not null default 0;
alter table public.users
  add column if not exists total_referrals int not null default 0;

-- Tournaments: add updated_at if missing (used by admin/end route)
alter table public.tournaments
  add column if not exists updated_at timestamptz not null default now();

comment on column public.users.total_earnings is 'Cached total earnings (cents) for leaderboard';
comment on column public.users.total_referrals is 'Cached referral count for leaderboard';

-- 2) Ensure referrals table exists (referrer tracking). If using profiles-based one from 20250224, keep it.
-- Create minimal referrals on public.users if not exists (idempotent).
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'referrals'
  ) then
    create table public.referrals (
      id uuid primary key default gen_random_uuid(),
      referrer_id uuid not null references public.users (id) on delete cascade,
      referred_user_id uuid not null references public.users (id) on delete cascade,
      created_at timestamptz not null default now()
    );
    create index referrals_referrer_id_idx on public.referrals (referrer_id);
    create index referrals_referred_user_id_idx on public.referrals (referred_user_id);
    alter table public.referrals enable row level security;
    create policy "Users can view own referrals"
      on public.referrals for select using (auth.uid() = referrer_id or auth.uid() = referred_user_id);
    create policy "Service role full access referrals"
      on public.referrals for all using (auth.jwt() ->> 'role' = 'service_role');
  end if;
end $$;

-- 3) RLS: Allow authenticated users to read users (for leaderboard display)
drop policy if exists "Authenticated can read users for leaderboard" on public.users;
create policy "Authenticated can read users for leaderboard"
  on public.users for select
  to authenticated
  using (true);

-- 4) RLS: Allow authenticated users to read teams (list/leaderboard)
drop policy if exists "Authenticated can read teams" on public.teams;
create policy "Authenticated can read teams"
  on public.teams for select
  to authenticated
  using (true);

-- 5) RLS: Allow authenticated users to read team_members
drop policy if exists "Authenticated can read team_members" on public.team_members;
create policy "Authenticated can read team_members"
  on public.team_members for select
  to authenticated
  using (true);

-- 6) RLS: Allow authenticated users to read tournaments
drop policy if exists "Authenticated can read tournaments" on public.tournaments;
create policy "Authenticated can read tournaments"
  on public.tournaments for select
  to authenticated
  using (true);

-- 7) RLS: Allow authenticated users to read tournament_players
drop policy if exists "Authenticated can read tournament_players" on public.tournament_players;
create policy "Authenticated can read tournament_players"
  on public.tournament_players for select
  to authenticated
  using (true);

-- 8) Earnings: ensure authenticated read own (already in 20250218100000; re-create if missing)
alter table public.earnings enable row level security;
drop policy if exists "Users can read own earnings" on public.earnings;
create policy "Users can read own earnings"
  on public.earnings for select
  using (auth.uid() = user_id);
drop policy if exists "Service role full access earnings" on public.earnings;
create policy "Service role full access earnings"
  on public.earnings for all
  using (auth.jwt() ->> 'role' = 'service_role');

-- 9) Withdrawals: ensure authenticated read own
alter table public.withdrawals enable row level security;
drop policy if exists "Users can read own withdrawals" on public.withdrawals;
create policy "Users can read own withdrawals"
  on public.withdrawals for select
  using (auth.uid() = user_id);
drop policy if exists "Service role full access withdrawals" on public.withdrawals;
create policy "Service role full access withdrawals"
  on public.withdrawals for all
  using (auth.jwt() ->> 'role' = 'service_role');

-- 10) Referrals (if table uses user_id/referred_user_id from profiles migration, ensure RLS allows authenticated read)
-- For referrals table that references profiles: policy may already exist. For our new one (referrer_id/referred_user_id) we did above.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'referrals' and column_name = 'user_id') then
    execute 'drop policy if exists "Users can view own referrals" on public.referrals';
    execute 'create policy "Users can view own referrals" on public.referrals for select using (auth.uid() = user_id)';
    execute 'drop policy if exists "Service role full access referrals" on public.referrals';
    execute 'create policy "Service role full access referrals" on public.referrals for all using (auth.jwt() ->> ''role'' = ''service_role'')';
  end if;
end $$;
