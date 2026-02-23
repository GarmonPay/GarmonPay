-- Teams and team members. One team per user. Rewards from prize_pool only.

-- Allow team_prize in transactions (profit-safe: from tournament prize pool only)
alter table public.transactions drop constraint if exists transactions_type_check;
alter table public.transactions add constraint transactions_type_check
  check (type in (
    'earning', 'withdrawal', 'ad_credit', 'referral',
    'spin_wheel', 'scratch_card', 'mystery_box', 'streak', 'mission',
    'tournament_entry', 'tournament_prize', 'team_prize'
  ));

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  owner_user_id uuid not null references public.users (id) on delete cascade,
  total_score numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists teams_owner on public.teams (owner_user_id);
create index if not exists teams_total_score on public.teams (total_score desc);

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  unique (user_id)
);

create index if not exists team_members_team_id on public.team_members (team_id);
create index if not exists team_members_user_id on public.team_members (user_id);

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
create policy "Service role teams" on public.teams for all using (auth.jwt() ->> 'role' = 'service_role');
create policy "Service role team_members" on public.team_members for all using (auth.jwt() ->> 'role' = 'service_role');

comment on table public.teams is 'Teams; total_score updated when member scores change';
comment on table public.team_members is 'One team per user; role owner or member';
