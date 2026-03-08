-- Boxing arena fight history: real-money fights with bet and platform fee.
create table if not exists public.fight_history (
  id uuid primary key default gen_random_uuid(),
  player1 uuid references public.users (id) on delete set null,
  player2 uuid references public.users (id) on delete set null,
  winner uuid references public.users (id) on delete set null,
  bet_amount_cents bigint not null check (bet_amount_cents >= 0),
  platform_fee_cents bigint not null default 0 check (platform_fee_cents >= 0),
  created_at timestamptz not null default now()
);

create index if not exists fight_history_player1 on public.fight_history (player1);
create index if not exists fight_history_player2 on public.fight_history (player2);
create index if not exists fight_history_winner on public.fight_history (winner);
create index if not exists fight_history_created_at on public.fight_history (created_at desc);

alter table public.fight_history enable row level security;

drop policy if exists "Authenticated can read fight_history" on public.fight_history;
create policy "Authenticated can read fight_history"
  on public.fight_history for select to authenticated using (true);
drop policy if exists "Service role full access fight_history" on public.fight_history;
create policy "Service role full access fight_history"
  on public.fight_history for all using (auth.jwt() ->> 'role' = 'service_role');

comment on table public.fight_history is 'Boxing arena real-money fight results: bet amount, platform fee, winner.';
