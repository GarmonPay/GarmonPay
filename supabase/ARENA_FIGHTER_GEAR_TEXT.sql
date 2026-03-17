-- Run in Supabase SQL Editor: change gear columns from UUID to TEXT and set defaults.
-- Run this after deploying the app that expects TEXT gear keys.

ALTER TABLE arena_fighters
  ALTER COLUMN equipped_gloves TYPE TEXT USING 'default',
  ALTER COLUMN equipped_shoes TYPE TEXT USING 'default',
  ALTER COLUMN equipped_shorts TYPE TEXT USING 'default',
  ALTER COLUMN equipped_headgear TYPE TEXT USING 'none';

UPDATE arena_fighters SET
  equipped_gloves = COALESCE(NULLIF(trim(equipped_gloves), ''), 'default'),
  equipped_shoes = COALESCE(NULLIF(trim(equipped_shoes), ''), 'default'),
  equipped_shorts = COALESCE(NULLIF(trim(equipped_shorts), ''), 'default'),
  equipped_headgear = COALESCE(NULLIF(trim(equipped_headgear), ''), 'none'),
  body_type = COALESCE(NULLIF(trim(body_type), ''), 'middleweight'),
  skin_tone = COALESCE(NULLIF(trim(skin_tone), ''), 'tone3'),
  fighter_color = COALESCE(NULLIF(trim(fighter_color), ''), '#f0a500'),
  condition = COALESCE(NULLIF(trim(condition), ''), 'fresh'),
  win_streak = COALESCE(win_streak, 0)
WHERE true;
