-- Single-row gamification config for admin dashboard.
-- Matches schema expected by admin gamification-config API (spin_cost, scratch_cost, etc.).
-- Run in Supabase SQL Editor or: supabase db execute -f supabase/gamification.sql

create table if not exists public.gamification_config (
  id uuid primary key default gen_random_uuid(),
  spin_cost numeric not null default 1,
  scratch_cost numeric not null default 1,
  mystery_box_cost numeric not null default 2,
  boxing_cost numeric not null default 1,
  pinball_cost numeric not null default 1,
  house_edge numeric not null default 0.10,
  created_at timestamptz not null default now()
);

-- Seed one row only if table is empty (no unique constraint on a single column, so we insert and ignore if already seeded).
insert into public.gamification_config (
  spin_cost,
  scratch_cost,
  mystery_box_cost,
  boxing_cost,
  pinball_cost,
  house_edge
)
select 1, 1, 2, 1, 1, 0.10
where not exists (select 1 from public.gamification_config limit 1);

alter table public.gamification_config enable row level security;

drop policy if exists "Service role full access gamification_config" on public.gamification_config;
create policy "Service role full access gamification_config"
  on public.gamification_config for all using (auth.jwt() ->> 'role' = 'service_role');

comment on table public.gamification_config is 'Admin-configurable costs and house edge for gamification (spin, scratch, mystery box, boxing, pinball).';
