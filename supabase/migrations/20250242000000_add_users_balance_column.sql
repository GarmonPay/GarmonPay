-- Add balance (and other expected columns) to public.users if missing.
-- Run this in Supabase SQL Editor or: supabase db push
-- Fixes: "column users.balance does not exist"

alter table public.users add column if not exists balance numeric default 0;
alter table public.users add column if not exists is_super_admin boolean default false;
alter table public.users add column if not exists role text default 'user';
alter table public.users add column if not exists email text;
alter table public.users add column if not exists created_at timestamptz default now();

comment on column public.users.balance is 'User wallet balance in cents';
