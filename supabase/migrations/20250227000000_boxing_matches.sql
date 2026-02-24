-- Boxing Arena: PvP entry-fee matches. Winner 90%, platform 10%.

-- Extend transactions for boxing
alter table public.transactions drop constraint if exists transactions_type_check;
alter table public.transactions add constraint transactions_type_check
  check (type in (
    'earning', 'withdrawal', 'ad_credit', 'referral',
    'spin_wheel', 'scratch_card', 'mystery_box', 'streak', 'mission',
    'tournament_entry', 'tournament_prize', 'team_prize',
    'fight_entry', 'fight_prize',
    'boxing_entry', 'boxing_prize'
  ));

-- Boxing matches
create table if not exists public.boxing_matches (
  id uuid primary key default gen_random_uuid(),
  player1_id uuid not null references public.users (id) on delete cascade,
  player2_id uuid references public.users (id) on delete set null,
  entry_fee bigint not null check (entry_fee > 0),
  winner_id uuid references public.users (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'active', 'completed', 'cancelled')),
  created_at timestamptz not null default now()
);

create index if not exists boxing_matches_player1 on public.boxing_matches (player1_id);
create index if not exists boxing_matches_player2 on public.boxing_matches (player2_id);
create index if not exists boxing_matches_status on public.boxing_matches (status);
create index if not exists boxing_matches_created_at on public.boxing_matches (created_at desc);

-- Optional: link platform_revenue to boxing match (source = 'boxing')
alter table public.platform_revenue add column if not exists boxing_match_id uuid references public.boxing_matches (id) on delete set null;
create index if not exists platform_revenue_boxing_match_id on public.platform_revenue (boxing_match_id);

alter table public.boxing_matches enable row level security;
create policy "Service role full access boxing_matches"
  on public.boxing_matches for all using (auth.jwt() ->> 'role' = 'service_role');
create policy "Users can read boxing_matches they are in"
  on public.boxing_matches for select using (
    auth.uid() = player1_id or auth.uid() = player2_id
  );
