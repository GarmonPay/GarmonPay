create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key,
  email text unique,
  role text default 'user',
  created_at timestamp default now()
);

create table if not exists public.deposits (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references users(id),
  amount numeric,
  status text,
  created_at timestamp default now()
);
