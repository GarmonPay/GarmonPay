-- Fighters table: one or more per user. Default stats speed 5, power 5, defense 5.
-- Used by Fight Arena and training.
create table if not exists public.fighters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null default 'Fighter',
  speed int not null default 5 check (speed >= 1 and speed <= 100),
  power int not null default 5 check (power >= 1 and power <= 100),
  defense int not null default 5 check (defense >= 1 and defense <= 100),
  wins int not null default 0,
  losses int not null default 0,
  level int not null default 1 check (level >= 1),
  earnings bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fighters_user_id on public.fighters (user_id);
create index if not exists fighters_wins on public.fighters (wins desc);
create index if not exists fighters_level on public.fighters (level desc);

alter table public.fighters enable row level security;

drop policy if exists "Users read own fighters" on public.fighters;
create policy "Users read own fighters"
  on public.fighters for select
  using (auth.uid() = user_id);

drop policy if exists "Anyone can read fighters (leaderboard)" on public.fighters;
create policy "Anyone can read fighters (leaderboard)"
  on public.fighters for select using (true);

drop policy if exists "Users insert own fighters" on public.fighters;
create policy "Users insert own fighters"
  on public.fighters for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own fighters" on public.fighters;
create policy "Users update own fighters"
  on public.fighters for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Service role full access fighters" on public.fighters;
create policy "Service role full access fighters"
  on public.fighters for all
  using (auth.jwt() ->> 'role' = 'service_role');

comment on table public.fighters is 'Fighters for arena: stats (speed, power, defense), wins, losses, level.';
