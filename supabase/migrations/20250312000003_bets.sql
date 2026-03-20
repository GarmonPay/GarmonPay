-- Spectator bets on fights. prediction = 'host' | 'opponent'. status = pending | won | lost.
create table if not exists public.bets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  fight_id uuid not null references public.fights (id) on delete cascade,
  amount bigint not null check (amount > 0),
  prediction text not null check (prediction in ('host', 'opponent')),
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

-- Ensure status column and constraint exist (handles table created in a prior run without status)
alter table public.bets add column if not exists status text not null default 'pending';
alter table public.bets drop constraint if exists bets_status_check;
alter table public.bets add constraint bets_status_check check (status in ('pending', 'won', 'lost'));

create index if not exists bets_fight_id on public.bets (fight_id);
create index if not exists bets_user_id on public.bets (user_id);
create index if not exists bets_status on public.bets (status);

alter table public.bets enable row level security;

drop policy if exists "Users read own bets" on public.bets;
create policy "Users read own bets"
  on public.bets for select using (auth.uid() = user_id);
drop policy if exists "Users insert own bets" on public.bets;
create policy "Users insert own bets"
  on public.bets for insert with check (auth.uid() = user_id);
drop policy if exists "Service role full access bets" on public.bets;
create policy "Service role full access bets"
  on public.bets for all using (auth.jwt() ->> 'role' = 'service_role');

comment on table public.bets is 'User bets on fights (spectators). prediction = host or opponent; status updated on fight end.';

-- Add status to fight_bets (two steps so CHECK sees the column)
alter table public.fight_bets add column if not exists status text not null default 'pending';
alter table public.fight_bets drop constraint if exists fight_bets_status_check;
alter table public.fight_bets add constraint fight_bets_status_check check (status in ('pending', 'won', 'lost'));
