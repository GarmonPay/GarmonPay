-- GarmonPay Pinball: pay-to-play sessions and leaderboard scores.

create table if not exists public.pinball_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists pinball_sessions_user_id on public.pinball_sessions (user_id);

create table if not exists public.pinball_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  session_id uuid not null references public.pinball_sessions (id) on delete cascade,
  score integer not null check (score >= 0),
  weekly_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists pinball_scores_user_id on public.pinball_scores (user_id);
create index if not exists pinball_scores_weekly on public.pinball_scores (weekly_key, score desc);
create index if not exists pinball_scores_all_time on public.pinball_scores (score desc);
create index if not exists pinball_scores_session_id on public.pinball_scores (session_id);

alter table public.pinball_sessions enable row level security;
alter table public.pinball_scores enable row level security;

drop policy if exists "Users read own pinball_sessions" on public.pinball_sessions;
create policy "Users read own pinball_sessions"
  on public.pinball_sessions for select using (auth.uid() = user_id);
drop policy if exists "Service role pinball_sessions" on public.pinball_sessions;
create policy "Service role pinball_sessions"
  on public.pinball_sessions for all using (auth.jwt() ->> 'role' = 'service_role');

drop policy if exists "Anyone read pinball_scores" on public.pinball_scores;
create policy "Anyone read pinball_scores"
  on public.pinball_scores for select using (true);
drop policy if exists "Service role pinball_scores" on public.pinball_scores;
create policy "Service role pinball_scores"
  on public.pinball_scores for all using (auth.jwt() ->> 'role' = 'service_role');

comment on table public.pinball_sessions is 'One paid session per game start; one score per session.';
comment on table public.pinball_scores is 'Pinball leaderboard: score per session, weekly_key = YYYY-Www for weekly leaderboard.';
