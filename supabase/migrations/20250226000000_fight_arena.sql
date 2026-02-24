-- GarmonPay: Fight Arena — fights, fight_escrow, platform_revenue (fight_id).

-- Extend transactions type for fight entry and prize
alter table public.transactions drop constraint if exists transactions_type_check;
alter table public.transactions add constraint transactions_type_check
  check (type in (
    'earning', 'withdrawal', 'ad_credit', 'referral',
    'spin_wheel', 'scratch_card', 'mystery_box', 'streak', 'mission',
    'tournament_entry', 'tournament_prize', 'team_prize',
    'fight_entry', 'fight_prize'
  ));

-- Fights table
create table if not exists public.fights (
  id uuid primary key default gen_random_uuid(),
  host_user_id uuid not null references public.users (id) on delete cascade,
  opponent_user_id uuid references public.users (id) on delete set null,
  entry_fee bigint not null check (entry_fee > 0),
  platform_fee bigint not null default 0 check (platform_fee >= 0),
  total_pot bigint not null default 0,
  status text not null default 'open' check (status in ('open', 'active', 'completed', 'cancelled')),
  winner_user_id uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fights_host_user_id on public.fights (host_user_id);
create index if not exists fights_opponent_user_id on public.fights (opponent_user_id);
create index if not exists fights_status on public.fights (status);
create index if not exists fights_created_at on public.fights (created_at desc);

-- Fight escrow: holds entry_fee per user until fight ends
create table if not exists public.fight_escrow (
  id uuid primary key default gen_random_uuid(),
  fight_id uuid not null references public.fights (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  amount bigint not null check (amount > 0),
  status text not null default 'held' check (status in ('held', 'released', 'refunded')),
  created_at timestamptz not null default now()
);

create unique index if not exists fight_escrow_fight_user on public.fight_escrow (fight_id, user_id);
create index if not exists fight_escrow_fight_id on public.fight_escrow (fight_id);

-- platform_revenue: ensure table exists and has fight_id (nullable)
create table if not exists public.platform_revenue (
  id uuid primary key default gen_random_uuid(),
  amount numeric not null default 0,
  source text,
  created_at timestamptz not null default now()
);

alter table public.platform_revenue add column if not exists fight_id uuid references public.fights (id) on delete set null;

create index if not exists platform_revenue_fight_id on public.platform_revenue (fight_id);
create index if not exists platform_revenue_created_at on public.platform_revenue (created_at desc);

-- RLS
alter table public.fights enable row level security;
alter table public.fight_escrow enable row level security;
alter table public.platform_revenue enable row level security;

create policy "Authenticated can read fights"
  on public.fights for select to authenticated using (true);
create policy "Service role full access fights"
  on public.fights for all using (auth.jwt() ->> 'role' = 'service_role');

create policy "Authenticated can read fight_escrow"
  on public.fight_escrow for select to authenticated using (true);
create policy "Service role full access fight_escrow"
  on public.fight_escrow for all using (auth.jwt() ->> 'role' = 'service_role');

create policy "Service role full access platform_revenue"
  on public.platform_revenue for all using (auth.jwt() ->> 'role' = 'service_role');

-- Realtime: enable for fights so clients can subscribe (skip if already added)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'fights'
  ) then
    alter publication supabase_realtime add table public.fights;
  end if;
exception when others then
  null; -- ignore if publication or table config differs
end $$;
