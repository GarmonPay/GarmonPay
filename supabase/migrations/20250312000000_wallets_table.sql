-- Wallets table (requested schema: id, user_id, balance, created_at, updated_at).
-- Kept in sync with wallet_balances via trigger so all balance changes flow through wallet_ledger_entry.
create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users (id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wallets_user_id on public.wallets (user_id);

comment on table public.wallets is 'User wallet balance (cents). Synced from wallet_balances. Use wallet_ledger_entry for all balance changes.';

alter table public.wallets enable row level security;

drop policy if exists "Users read own wallets" on public.wallets;
create policy "Users read own wallets"
  on public.wallets for select
  using (auth.uid() = user_id);

drop policy if exists "Service role full access wallets" on public.wallets;
create policy "Service role full access wallets"
  on public.wallets for all
  using (auth.jwt() ->> 'role' = 'service_role');

-- Sync wallet_balances -> wallets (after wallet_ledger_entry updates wallet_balances)
create or replace function public.sync_wallets_from_wallet_balances()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.wallets (user_id, balance, updated_at)
  values (new.user_id, new.balance, now())
  on conflict (user_id) do update set
    balance = excluded.balance,
    updated_at = excluded.updated_at;
  return new;
end;
$$;

drop trigger if exists sync_wallets_from_wallet_balances_trigger on public.wallet_balances;
create trigger sync_wallets_from_wallet_balances_trigger
  after insert or update of balance on public.wallet_balances
  for each row execute procedure public.sync_wallets_from_wallet_balances();

-- Backfill wallets from wallet_balances
insert into public.wallets (user_id, balance, created_at, updated_at)
select user_id, balance, coalesce(updated_at, now()), now()
from public.wallet_balances
on conflict (user_id) do update set
  balance = excluded.balance,
  updated_at = excluded.updated_at;
