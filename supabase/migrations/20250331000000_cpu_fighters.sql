-- CPU opponents without auth.users: standalone catalog for Arena boxing vs AI.
-- arena_fights can reference either arena_fighters (fighter_b_id) OR cpu_fighters (cpu_fighter_id), not both.

create table if not exists public.cpu_fighters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  strength int not null check (strength >= 1 and strength <= 99),
  speed int not null check (speed >= 1 and speed <= 99),
  stamina int not null check (stamina >= 1 and stamina <= 99),
  difficulty int not null check (difficulty >= 1 and difficulty <= 10),
  style text not null default 'Brawler',
  avatar text not null default '🥊',
  defense int not null default 48 check (defense >= 1 and defense <= 99),
  chin int not null default 48 check (chin >= 1 and chin <= 99),
  special int not null default 20 check (special >= 1 and special <= 99),
  created_at timestamptz not null default now()
);

comment on table public.cpu_fighters is 'Arena CPU opponents (no auth.users). Referenced by arena_fights.cpu_fighter_id when fighter_b_id is null.';

create index if not exists cpu_fighters_difficulty on public.cpu_fighters (difficulty);

-- arena_fights: B-side can be arena_fighter OR cpu_fighter row
alter table public.arena_fights alter column fighter_b_id drop not null;

alter table public.arena_fights add column if not exists cpu_fighter_id uuid references public.cpu_fighters (id) on delete set null;
alter table public.arena_fights add column if not exists winner_cpu_fighter_id uuid references public.cpu_fighters (id) on delete set null;

alter table public.arena_fights drop constraint if exists arena_fights_opponent_b_xor;
alter table public.arena_fights add constraint arena_fights_opponent_b_xor check (
  (fighter_b_id is not null and cpu_fighter_id is null)
  or (fighter_b_id is null and cpu_fighter_id is not null)
);

alter table public.arena_fights drop constraint if exists arena_fights_winner_xor;
-- At most one of arena fighter winner vs CPU catalog winner (both null = fight in progress)
alter table public.arena_fights add constraint arena_fights_winner_xor check (
  not (winner_id is not null and winner_cpu_fighter_id is not null)
);

-- Seed 6 CPU fighters (stable UUIDs for clients/tests)
insert into public.cpu_fighters (id, name, strength, speed, stamina, difficulty, style, avatar, defense, chin, special) values
  ('a1000000-0000-0000-0000-000000000001', 'Brutus', 65, 45, 50, 4, 'Brawler', '🥊', 45, 60, 25),
  ('a1000000-0000-0000-0000-000000000002', 'Shadow', 52, 62, 55, 5, 'Boxer', '🥊', 58, 48, 28),
  ('a1000000-0000-0000-0000-000000000003', 'Tank', 72, 38, 48, 6, 'Slugger', '🥊', 42, 65, 30),
  ('a1000000-0000-0000-0000-000000000004', 'Slick', 48, 58, 52, 5, 'Counter Puncher', '🥊', 68, 50, 32),
  ('a1000000-0000-0000-0000-000000000005', 'Rush', 55, 68, 58, 7, 'Swarmer', '🥊', 44, 48, 26),
  ('a1000000-0000-0000-0000-000000000006', 'Ice', 50, 55, 54, 6, 'Technician', '🥊', 62, 52, 35)
on conflict (id) do nothing;

alter table public.cpu_fighters enable row level security;

drop policy if exists "Anyone can read cpu_fighters" on public.cpu_fighters;
create policy "Anyone can read cpu_fighters"
  on public.cpu_fighters for select
  to anon, authenticated
  using (true);

drop policy if exists "Service role full access cpu_fighters" on public.cpu_fighters;
create policy "Service role full access cpu_fighters"
  on public.cpu_fighters for all
  to service_role
  using (true)
  with check (true);
