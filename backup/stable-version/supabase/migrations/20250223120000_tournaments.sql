-- Profit-safe tournaments: entry fees go to prize_pool; payouts from prize_pool only.

-- Extend transactions for tournament entry and prize
alter table public.transactions drop constraint if exists transactions_type_check;
alter table public.transactions add constraint transactions_type_check
  check (type in (
    'earning', 'withdrawal', 'ad_credit', 'referral',
    'spin_wheel', 'scratch_card', 'mystery_box', 'streak', 'mission',
    'tournament_entry', 'tournament_prize'
  ));

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  entry_fee numeric not null default 0,
  prize_pool numeric not null default 0,
  start_date timestamptz not null,
  end_date timestamptz not null,
  status text not null default 'upcoming' check (status in ('upcoming', 'active', 'ended')),
  created_at timestamptz not null default now()
);

create index if not exists tournaments_status on public.tournaments (status);
create index if not exists tournaments_end_date on public.tournaments (end_date);

create table if not exists public.tournament_players (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  score numeric not null default 0,
  joined_at timestamptz not null default now(),
  unique (tournament_id, user_id)
);

create index if not exists tournament_players_tournament_id on public.tournament_players (tournament_id);
create index if not exists tournament_players_score on public.tournament_players (tournament_id, score desc);

alter table public.tournaments enable row level security;
alter table public.tournament_players enable row level security;
create policy "Service role tournaments" on public.tournaments for all using (auth.jwt() ->> 'role' = 'service_role');
create policy "Service role tournament_players" on public.tournament_players for all using (auth.jwt() ->> 'role' = 'service_role');

comment on table public.tournaments is 'Tournaments; prize_pool from entry fees only (profit-safe)';
comment on table public.tournament_players is 'Players in a tournament; score updated server-side only';
