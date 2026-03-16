-- GarmonPay Pinball: games, jackpot, leaderboard for new pinball modes.

create table if not exists public.pinball_games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  mode text not null check (mode in ('free', 'h2h', 'tournament')),
  score integer not null default 0 check (score >= 0),
  balls_used integer not null default 0,
  duration_seconds integer not null default 0,
  garmon_completions integer not null default 0,
  jackpot_hit boolean not null default false,
  coins_earned integer not null default 0,
  cash_earned_cents integer not null default 0,
  hit_log jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists pinball_games_user_id on public.pinball_games (user_id);
create index if not exists pinball_games_created_at on public.pinball_games (created_at desc);
create index if not exists pinball_games_mode on public.pinball_games (mode);

create table if not exists public.pinball_jackpot (
  id uuid primary key default gen_random_uuid(),
  current_amount_cents integer not null default 500 check (current_amount_cents >= 0),
  last_won_at timestamptz,
  last_winner_id uuid,
  total_contributed_cents bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.pinball_leaderboard (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  username text,
  highest_score integer not null default 0,
  total_score bigint not null default 0,
  games_played integer not null default 0,
  level integer not null default 1,
  level_name text not null default 'ROOKIE',
  wins integer not null default 0,
  losses integer not null default 0,
  total_earned_cents bigint not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists pinball_leaderboard_highest on public.pinball_leaderboard (highest_score desc);
create index if not exists pinball_leaderboard_total on public.pinball_leaderboard (total_score desc);

alter table public.pinball_games enable row level security;
alter table public.pinball_jackpot enable row level security;
alter table public.pinball_leaderboard enable row level security;

create policy "Users read own pinball_games"
  on public.pinball_games for select using (auth.uid() = user_id);
create policy "Service role pinball_games"
  on public.pinball_games for all using (auth.jwt() ->> 'role' = 'service_role');

create policy "Anyone read pinball_jackpot"
  on public.pinball_jackpot for select using (true);
create policy "Service role pinball_jackpot"
  on public.pinball_jackpot for all using (auth.jwt() ->> 'role' = 'service_role');

create policy "Anyone read pinball_leaderboard"
  on public.pinball_leaderboard for select using (true);
create policy "Service role pinball_leaderboard"
  on public.pinball_leaderboard for all using (auth.jwt() ->> 'role' = 'service_role');

insert into public.pinball_jackpot (current_amount_cents, updated_at)
select 500, now()
where not exists (select 1 from public.pinball_jackpot limit 1);

comment on table public.pinball_games is 'Single pinball game record; mode free/h2h/tournament.';
comment on table public.pinball_jackpot is 'Shared jackpot pool; 2% of paid entries.';
comment on table public.pinball_leaderboard is 'Per-user pinball stats and level for leaderboard.';
