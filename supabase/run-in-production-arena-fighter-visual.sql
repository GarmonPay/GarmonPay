-- Run in Supabase Dashboard → SQL Editor to add visual customization columns to arena_fighters.
-- Safe to run multiple times (idempotent).

ALTER TABLE public.arena_fighters ADD COLUMN IF NOT EXISTS body_type TEXT DEFAULT 'middleweight';
ALTER TABLE public.arena_fighters ADD COLUMN IF NOT EXISTS skin_tone TEXT DEFAULT 'tone3';
ALTER TABLE public.arena_fighters ADD COLUMN IF NOT EXISTS face_style TEXT DEFAULT 'determined';
ALTER TABLE public.arena_fighters ADD COLUMN IF NOT EXISTS hair_style TEXT DEFAULT 'short_fade';

COMMENT ON COLUMN public.arena_fighters.body_type IS 'Visual only: lightweight | middleweight | heavyweight';
COMMENT ON COLUMN public.arena_fighters.skin_tone IS 'Visual: tone1-tone6';
COMMENT ON COLUMN public.arena_fighters.face_style IS 'Visual: determined, fierce, calm, angry, scarred, young, veteran, masked';
COMMENT ON COLUMN public.arena_fighters.hair_style IS 'Visual: bald, short_fade, dreads, cornrows, afro, mohawk, buzz_cut, long_tied';
