-- AI-generated fighter fields and free-generation tracking.
-- Run after 20250322000000_arena_fighter_visual_columns.sql

-- arena_fighters: AI profile and portrait
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

comment on column public.arena_fighters.generation_method is 'manual | questionnaire | auto';
comment on column public.arena_fighters.free_generation_used is 'True if user used their one free AI generation for this fighter';

-- users: track free AI generation (one per user, not per fighter)
alter table public.users add column if not exists arena_free_generation_used boolean default false;
comment on column public.users.arena_free_generation_used is 'True if user has used their one free AI fighter generation';
