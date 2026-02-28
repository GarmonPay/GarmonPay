-- Ensure public.users has required columns (financial source of truth).
-- Run in Supabase SQL Editor or via migration.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS balance numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS role text DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS is_super_admin boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
