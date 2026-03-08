-- Boxing Career Mode: create boxing_profiles if missing, then add name + stats (power, speed, stamina, defense, chin).
-- Safe to run whether or not 20250228000000_boxing_realtime_betting was applied.

create table if not exists public.boxing_profiles (
  user_id uuid primary key references public.users (id) on delete cascade,
  level int not null default 1 check (level >= 1),
  wins int not null default 0,
  losses int not null default 0,
  knockouts int not null default 0,
  earnings bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists boxing_profiles_level on public.boxing_profiles (level desc);

alter table public.boxing_profiles enable row level security;

drop policy if exists "Anyone can read boxing_profiles" on public.boxing_profiles;
create policy "Anyone can read boxing_profiles"
  on public.boxing_profiles for select using (true);
drop policy if exists "Service role full access boxing_profiles" on public.boxing_profiles;
create policy "Service role full access boxing_profiles"
  on public.boxing_profiles for all using (auth.jwt() ->> 'role' = 'service_role');

-- Career mode columns (add if not exists)
alter table public.boxing_profiles
  add column if not exists name text,
  add column if not exists power int not null default 50 check (power >= 1 and power <= 100),
  add column if not exists speed int not null default 50 check (speed >= 1 and speed <= 100),
  add column if not exists stamina int not null default 50 check (stamina >= 1 and stamina <= 100),
  add column if not exists defense int not null default 50 check (defense >= 1 and defense <= 100),
  add column if not exists chin int not null default 50 check (chin >= 1 and chin <= 100);

comment on table public.boxing_profiles is 'Boxer profile for Fight Arena: record and stats.';
comment on column public.boxing_profiles.name is 'Fighter display name for Career Mode.';
comment on column public.boxing_profiles.power is 'Punch power 1-100.';
comment on column public.boxing_profiles.speed is 'Movement/reaction speed 1-100.';
comment on column public.boxing_profiles.stamina is 'Stamina 1-100.';
comment on column public.boxing_profiles.defense is 'Block/dodge 1-100.';
comment on column public.boxing_profiles.chin is 'Damage resistance 1-100.';

drop policy if exists "Users can update own boxing_profiles" on public.boxing_profiles;
create policy "Users can update own boxing_profiles"
  on public.boxing_profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can insert own boxing_profiles" on public.boxing_profiles;
create policy "Users can insert own boxing_profiles"
  on public.boxing_profiles for insert
  with check (auth.uid() = user_id);
