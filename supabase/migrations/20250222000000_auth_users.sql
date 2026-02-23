-- GarmonPay: users table linked to Supabase Auth (auth.users).
-- Run in Supabase SQL Editor after enabling Auth.
-- Fields: id, email, role, membership, balance, referral_code

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('member', 'admin')),
  membership text not null default 'starter' check (membership in ('starter', 'pro', 'elite', 'vip')),
  balance bigint not null default 0,
  referral_code text unique,
  referred_by_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists users_email_idx on public.users (email);
create index if not exists users_referral_code_idx on public.users (referral_code);

-- Trigger: create public.users row when a new auth user signs up
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  new_referral_code text;
begin
  new_referral_code := upper(substr(md5(random()::text), 1, 8));
  insert into public.users (id, email, referral_code)
  values (
    new.id,
    new.email,
    new_referral_code
  )
  on conflict (id) do update set
    email = excluded.email,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

-- RLS: users can read/update own row
alter table public.users enable row level security;

create policy "Users can read own row"
  on public.users for select
  using (auth.uid() = id);

create policy "Users can update own row"
  on public.users for update
  using (auth.uid() = id);

-- Service role can do anything (API with service key)
create policy "Service role full access"
  on public.users for all
  using (auth.jwt() ->> 'role' = 'service_role');
