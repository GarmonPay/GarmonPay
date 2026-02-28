-- =============================================================================
-- GarmonPay MASTER REPAIR: user sync, transactions table, balance automation,
-- and backfill auth.users → public.users. Run in Supabase SQL Editor or:
--   supabase db push
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 1: Ensure public.users columns and handle_new_user trigger
-- -----------------------------------------------------------------------------
alter table public.users add column if not exists email text;
alter table public.users add column if not exists balance numeric default 0;
alter table public.users add column if not exists role text default 'user';
alter table public.users add column if not exists is_super_admin boolean default false;
alter table public.users add column if not exists created_at timestamptz default now();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email, balance, role, is_super_admin, created_at)
  values (new.id, new.email, 0, 'user', false, now())
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- -----------------------------------------------------------------------------
-- STEP 2: Ensure transactions table has required columns and FK
-- -----------------------------------------------------------------------------
alter table public.transactions add column if not exists user_id uuid references public.users(id);
alter table public.transactions add column if not exists type text;
alter table public.transactions add column if not exists amount numeric;
alter table public.transactions add column if not exists status text default 'pending';
alter table public.transactions add column if not exists description text;
alter table public.transactions add column if not exists created_at timestamptz default now();

-- If table was created without user_id FK, add it only if missing
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.transactions'::regclass and conname = 'transactions_user_id_fkey'
  ) then
    alter table public.transactions add constraint transactions_user_id_fkey
      foreign key (user_id) references public.users(id);
  end if;
exception
  when others then null;
end $$;

-- Ensure id default exists
alter table public.transactions alter column id set default gen_random_uuid();

-- -----------------------------------------------------------------------------
-- STEP 3: Wallet balance automation — update users.balance when transaction completed
-- -----------------------------------------------------------------------------
create or replace function public.sync_balance_on_transaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  amt numeric;
begin
  if new.status is distinct from 'completed' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'completed' then
    return new; -- already applied
  end if;

  amt := coalesce(new.amount, 0);
  if new.user_id is null then
    return new;
  end if;

  if lower(coalesce(new.type, '')) = 'withdrawal' then
    update public.users set balance = coalesce(balance, 0) - amt where id = new.user_id;
  else
    update public.users set balance = coalesce(balance, 0) + amt where id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_balance_on_transaction_trigger on public.transactions;
create trigger sync_balance_on_transaction_trigger
  after insert or update of status on public.transactions
  for each row execute procedure public.sync_balance_on_transaction();

-- -----------------------------------------------------------------------------
-- STEP 5: Backfill — copy auth.users into public.users where missing
-- -----------------------------------------------------------------------------
insert into public.users (id, email, balance, role, is_super_admin, created_at)
select
  au.id,
  au.email,
  0,
  'user',
  false,
  coalesce(au.created_at, now())
from auth.users au
where not exists (select 1 from public.users pu where pu.id = au.id)
on conflict (id) do update set email = excluded.email;

-- -----------------------------------------------------------------------------
-- Ensure profit and revenue tables exist (for dashboard stats)
-- -----------------------------------------------------------------------------
create table if not exists public.profit (
  id uuid default gen_random_uuid() primary key,
  amount numeric default 0,
  source text,
  created_at timestamptz default now()
);
create table if not exists public.revenue (
  id uuid default gen_random_uuid() primary key,
  amount numeric default 0,
  source text,
  created_at timestamptz default now()
);

comment on function public.handle_new_user() is 'Inserts public.users row when auth.users row is created.';
comment on function public.sync_balance_on_transaction() is 'Updates public.users.balance when a transaction is inserted/updated with status=completed.';
