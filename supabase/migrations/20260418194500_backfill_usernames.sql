-- Backfill username from email local-part where missing (C-Lo display + joins).

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS username text;

UPDATE public.users
SET username = NULLIF(trim(split_part(email, '@', 1)), '')
WHERE (username IS NULL OR trim(username) = '')
  AND email IS NOT NULL
  AND trim(email) <> ''
  AND position('@' IN email) > 0;
