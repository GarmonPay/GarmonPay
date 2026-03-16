-- AI fighter columns and free-generation tracking.
-- Run in Supabase Dashboard → SQL Editor after arena_fighters and users exist.
-- Safe to run multiple times (add column if not exists).

-- arena_fighters
alter table public.arena_fighters add column if not exists nickname text;
alter table public.arena_fighters add column if not exists origin text;
alter table public.arena_fighters add column if not exists backstory text;
alter table public.arena_fighters add column if not exists personality text;
alter table public.arena_fighters add column if not exists trash_talk_style text;
alter table public.arena_fighters add column if not exists signature_move_name text;
alter table public.arena_fighters add column if not exists signature_move_desc text;
alter table public.arena_fighters add column if not exists recommended_training text;
alter table public.arena_fighters add column if not exists fighter_color text default '#f0a500';
alter table public.arena_fighters add column if not exists portrait_svg text;
alter table public.arena_fighters add column if not exists generation_method text default 'manual';
alter table public.arena_fighters add column if not exists free_generation_used boolean default false;

-- users
alter table public.users add column if not exists arena_free_generation_used boolean default false;
