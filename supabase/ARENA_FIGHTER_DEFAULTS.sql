-- Set default values for existing arena_fighters with NULL visual columns.
-- Run in Supabase SQL Editor. Safe to run multiple times.
-- Fixes "Cannot read properties of undefined" when old rows have null body_type, etc.
-- Note: equipped_gloves, equipped_shoes, equipped_shorts, equipped_headgear are UUID (FK to store items).
-- Leave them NULL; the app uses 'default' / 'none' when null.

UPDATE arena_fighters SET body_type = 'middleweight' WHERE body_type IS NULL;
UPDATE arena_fighters SET skin_tone = 'tone3' WHERE skin_tone IS NULL;
UPDATE arena_fighters SET face_style = 'determined' WHERE face_style IS NULL;
UPDATE arena_fighters SET hair_style = 'short_fade' WHERE hair_style IS NULL;
UPDATE arena_fighters SET fighter_color = '#f0a500' WHERE fighter_color IS NULL;
UPDATE arena_fighters SET condition = 'fresh' WHERE condition IS NULL;
UPDATE arena_fighters SET win_streak = 0 WHERE win_streak IS NULL;
