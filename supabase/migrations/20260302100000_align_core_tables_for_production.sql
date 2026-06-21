-- Align core public schema with production code expectations.
-- Safe/idempotent: creates tables if missing, adds missing columns, and backfills from legacy columns.

create extension if not exists pgcrypto;

create table if not exists public.banners (
  id uuid primary key default gen_random_uuid(),
  title text,
  image_url text,
  link text,
  status text default 'active',
  created_at timestamp with time zone default now()
);

alter table if exists public.banners
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists title text,
  add column if not exists image_url text,
  add column if not exists link text,
  add column if not exists status text default 'active',
  add column if not exists created_at timestamp with time zone default now();

alter table if exists public.banners
  alter column status set default 'active',
  alter column created_at set default now();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'banners'
      and column_name = 'target_url'
  ) then
    update public.banners
    set link = target_url
    where link is null
      and target_url is not null;
  end if;
end
$$;

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text,
  created_at timestamp with time zone default now()
);

alter table if exists public.teams
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists name text,
  add column if not exists created_at timestamp with time zone default now();

alter table if exists public.teams
  alter column created_at set default now();

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text,
  created_at timestamp with time zone default now()
);

alter table if exists public.tournaments
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists name text,
  add column if not exists created_at timestamp with time zone default now();

alter table if exists public.tournaments
  alter column created_at set default now();

create table if not exists public.stripe_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  amount numeric,
  created_at timestamp with time zone default now()
);

alter table if exists public.stripe_payments
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists user_id uuid,
  add column if not exists amount numeric,
  add column if not exists created_at timestamp with time zone default now();

alter table if exists public.stripe_payments
  alter column created_at set default now();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stripe_payments'
      and column_name = 'amount_cents'
  ) then
    update public.stripe_payments
    set amount = (amount_cents::numeric / 100.0)
    where amount is null
      and amount_cents is not null;
  end if;
end
$$;
