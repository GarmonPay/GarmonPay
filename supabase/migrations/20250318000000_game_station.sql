-- Game Station: unified scores for all arcade games (pinball, runner, snake, etc.).
-- Used for global and per-game leaderboards.

create table if not exists public.game_station_scores (
  id uuid primary key default gen_random_uuid(),
  game_slug text not null,
  user_id uuid not null,
  score integer not null check (score >= 0),
  weekly_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists game_station_scores_game_slug on public.game_station_scores (game_slug);
create index if not exists game_station_scores_user_id on public.game_station_scores (user_id);
create index if not exists game_station_scores_weekly on public.game_station_scores (game_slug, weekly_key, score desc);
create index if not exists game_station_scores_all_time on public.game_station_scores (game_slug, score desc);

alter table public.game_station_scores enable row level security;

drop policy if exists "Anyone read game_station_scores" on public.game_station_scores;
create policy "Anyone read game_station_scores"
  on public.game_station_scores for select using (true);
drop policy if exists "Service role game_station_scores" on public.game_station_scores;
create policy "Service role game_station_scores"
  on public.game_station_scores for all using (auth.jwt() ->> 'role' = 'service_role');

comment on table public.game_station_scores is 'Arcade game scores; game_slug = pinball, runner, snake, shooter, dodge, tap, memory, reaction, spin, boxing. weekly_key = YYYY-Www.';
