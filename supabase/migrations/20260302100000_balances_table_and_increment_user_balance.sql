-- Ensure Stripe checkout credits are reflected in public.balances.
create table if not exists public.balances (
  user_id uuid primary key references public.users(id) on delete cascade,
  balance numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.balances add column if not exists user_id uuid;
alter table public.balances add column if not exists balance numeric default 0;
alter table public.balances add column if not exists created_at timestamptz default now();
alter table public.balances add column if not exists updated_at timestamptz default now();

create unique index if not exists balances_user_id_idx on public.balances (user_id);
create index if not exists balances_updated_at_idx on public.balances (updated_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.balances'::regclass
      and conname = 'balances_user_id_fkey'
  ) then
    alter table public.balances
      add constraint balances_user_id_fkey
      foreign key (user_id) references public.users(id) on delete cascade;
  end if;
exception
  when others then null;
end $$;

alter table public.balances enable row level security;

drop policy if exists "Users can read own balance row" on public.balances;
create policy "Users can read own balance row"
  on public.balances for select
  using (auth.uid() = user_id);

drop policy if exists "Service role full access balances" on public.balances;
create policy "Service role full access balances"
  on public.balances for all
  using (auth.jwt() ->> 'role' = 'service_role');

create or replace function public.increment_user_balance(
  p_user_id uuid,
  p_amount_cents bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null or p_amount_cents is null or p_amount_cents <= 0 then
    return;
  end if;

  insert into public.balances (user_id, balance, updated_at)
  values (p_user_id, p_amount_cents, now())
  on conflict (user_id) do update
    set balance = coalesce(public.balances.balance, 0) + p_amount_cents,
        updated_at = now();

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'users'
      and column_name = 'withdrawable_balance'
  ) then
    update public.users
    set
      balance = coalesce(balance, 0) + p_amount_cents,
      withdrawable_balance = coalesce(withdrawable_balance, 0) + p_amount_cents
    where id = p_user_id;
  else
    update public.users
    set balance = coalesce(balance, 0) + p_amount_cents
    where id = p_user_id;
  end if;
end;
$$;

comment on table public.balances is 'Per-user wallet balance table used by Stripe checkout credits.';
comment on function public.increment_user_balance(uuid, bigint)
  is 'Credits public.balances.balance and mirrors public.users balance fields.';
