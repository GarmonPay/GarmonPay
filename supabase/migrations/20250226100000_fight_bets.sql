-- GarmonPay: Player vs Player betting — fight_bets table.
-- Both players deposit entry_fee; choice = who they bet on (host | opponent). Winner gets pot minus 10% platform fee.

create table if not exists public.fight_bets (
  id uuid primary key default gen_random_uuid(),
  fight_id uuid not null references public.fights (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  amount bigint not null check (amount > 0),
  choice text not null check (choice in ('host', 'opponent')),
  created_at timestamptz not null default now()
);

create unique index if not exists fight_bets_fight_user on public.fight_bets (fight_id, user_id);
create index if not exists fight_bets_fight_id on public.fight_bets (fight_id);

alter table public.fight_bets enable row level security;

create policy "Authenticated can read fight_bets"
  on public.fight_bets for select to authenticated using (true);
create policy "Service role full access fight_bets"
  on public.fight_bets for all using (auth.jwt() ->> 'role' = 'service_role');

comment on table public.fight_bets is 'PvP bets: one row per player per fight; amount = entry_fee, choice = host or opponent';
