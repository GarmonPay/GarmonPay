-- Real-time Boxing: escrow, live fights, betting, tournaments, boxer profiles.

-- 1) Extend transactions for boxing bets
alter table public.transactions drop constraint if exists transactions_type_check;
alter table public.transactions add constraint transactions_type_check
  check (type in (
    'earning', 'withdrawal', 'ad_credit', 'referral',
    'spin_wheel', 'scratch_card', 'mystery_box', 'streak', 'mission',
    'tournament_entry', 'tournament_prize', 'team_prize',
    'fight_entry', 'fight_prize',
    'boxing_entry', 'boxing_prize', 'boxing_bet', 'boxing_bet_payout'
  ));

-- 2) Extend boxing_matches for real-time: status searching/live, health, fight_log
alter table public.boxing_matches drop constraint if exists boxing_matches_status_check;
alter table public.boxing_matches add constraint boxing_matches_status_check
  check (status in ('searching', 'pending', 'live', 'active', 'completed', 'cancelled'));

alter table public.boxing_matches add column if not exists player1_health int not null default 100;
alter table public.boxing_matches add column if not exists player2_health int not null default 100;
alter table public.boxing_matches add column if not exists fight_seconds_elapsed int not null default 0;
alter table public.boxing_matches add column if not exists fight_log jsonb not null default '[]';
alter table public.boxing_matches add column if not exists started_at timestamptz;
alter table public.boxing_matches add column if not exists next_tick_at timestamptz;

comment on column public.boxing_matches.fight_log is 'Array of {t: second, type: punch|block|miss|critical, attacker: 1|2, target: 1|2, damage?: number, msg: string}';

-- 3) Boxing escrow: one row per match
create table if not exists public.boxing_escrow (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.boxing_matches (id) on delete cascade,
  player1_id uuid not null references public.users (id) on delete cascade,
  player2_id uuid references public.users (id) on delete set null,
  amount bigint not null check (amount > 0),
  created_at timestamptz not null default now()
);

create unique index if not exists boxing_escrow_match_id on public.boxing_escrow (match_id);
create index if not exists boxing_escrow_player1 on public.boxing_escrow (player1_id);
create index if not exists boxing_escrow_player2 on public.boxing_escrow (player2_id);

alter table public.boxing_escrow enable row level security;
create policy "Service role full access boxing_escrow"
  on public.boxing_escrow for all using (auth.jwt() ->> 'role' = 'service_role');

-- 4) Boxing bets (spectators)
create table if not exists public.boxing_bets (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.boxing_matches (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  bet_on_player_id uuid not null references public.users (id) on delete cascade,
  amount bigint not null check (amount > 0),
  payout bigint not null default 0,
  status text not null default 'pending' check (status in ('pending', 'won', 'lost', 'refunded')),
  created_at timestamptz not null default now()
);

create index if not exists boxing_bets_match_id on public.boxing_bets (match_id);
create index if not exists boxing_bets_user_id on public.boxing_bets (user_id);
create index if not exists boxing_bets_status on public.boxing_bets (status);

alter table public.boxing_bets enable row level security;
create policy "Service role full access boxing_bets"
  on public.boxing_bets for all using (auth.jwt() ->> 'role' = 'service_role');
create policy "Users can read own boxing_bets"
  on public.boxing_bets for select using (auth.uid() = user_id);

-- 5) Boxing tournaments
create table if not exists public.boxing_tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  entry_fee bigint not null check (entry_fee > 0),
  max_players int not null check (max_players >= 2),
  prize_pool bigint not null default 0,
  status text not null default 'open' check (status in ('open', 'filled', 'in_progress', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists boxing_tournaments_status on public.boxing_tournaments (status);

alter table public.boxing_tournaments enable row level security;
create policy "Anyone can read boxing_tournaments"
  on public.boxing_tournaments for select using (true);
create policy "Service role full access boxing_tournaments"
  on public.boxing_tournaments for all using (auth.jwt() ->> 'role' = 'service_role');

-- 6) Boxing profiles (level, wins, losses, knockouts, earnings)
create table if not exists public.boxing_profiles (
  user_id uuid primary key references public.users (id) on delete cascade,
  level int not null default 1 check (level >= 1),
  wins int not null default 0,
  losses int not null default 0,
  knockouts int not null default 0,
  earnings bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists boxing_profiles_level on public.boxing_profiles (level desc);

alter table public.boxing_profiles enable row level security;
create policy "Anyone can read boxing_profiles"
  on public.boxing_profiles for select using (true);
create policy "Service role full access boxing_profiles"
  on public.boxing_profiles for all using (auth.jwt() ->> 'role' = 'service_role');

-- Enable Realtime for boxing_matches (run in Supabase Dashboard if this fails)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'boxing_matches'
  ) then
    execute 'alter publication supabase_realtime add table public.boxing_matches';
  end if;
end $$;
