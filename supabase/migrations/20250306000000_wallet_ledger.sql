-- Secure wallet ledger system: immutable ledger + balance table, atomic RPC for all movements.
-- All money operations: insert wallet_ledger -> update wallet_balances -> return balance.

-- Wallet balances: one row per user (source of truth for current balance)
create table if not exists public.wallet_balances (
  user_id uuid primary key references public.users (id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists wallet_balances_updated_at on public.wallet_balances (updated_at desc);

comment on table public.wallet_balances is 'Current wallet balance per user (cents). Updated only via wallet_ledger_entry RPC.';

-- Wallet ledger: append-only log of every movement
create table if not exists public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  type text not null check (type in (
    'deposit', 'withdrawal', 'game_play', 'game_win', 'referral_bonus',
    'subscription_payment', 'commission_payout', 'admin_adjustment'
  )),
  amount bigint not null,
  balance_after bigint not null check (balance_after >= 0),
  reference text,
  created_at timestamptz not null default now()
);

create index if not exists wallet_ledger_user_id on public.wallet_ledger (user_id);
create index if not exists wallet_ledger_created_at on public.wallet_ledger (created_at desc);
create index if not exists wallet_ledger_type on public.wallet_ledger (type);
create unique index if not exists wallet_ledger_reference on public.wallet_ledger (reference) where reference is not null and reference != '';

comment on table public.wallet_ledger is 'Append-only wallet ledger. amount in cents; positive = credit, negative = debit. balance_after = balance after this entry.';
comment on column public.wallet_ledger.reference is 'Idempotency/reference key (e.g. stripe_pi_xxx) to block duplicate transactions.';

-- RLS
alter table public.wallet_balances enable row level security;
alter table public.wallet_ledger enable row level security;

drop policy if exists "Users read own wallet_balances" on public.wallet_balances;
create policy "Users read own wallet_balances"
  on public.wallet_balances for select
  using (auth.uid() = user_id);

drop policy if exists "Service role full access wallet_balances" on public.wallet_balances;
create policy "Service role full access wallet_balances"
  on public.wallet_balances for all
  using (auth.jwt() ->> 'role' = 'service_role');

drop policy if exists "Users read own wallet_ledger" on public.wallet_ledger;
create policy "Users read own wallet_ledger"
  on public.wallet_ledger for select
  using (auth.uid() = user_id);

drop policy if exists "Service role full access wallet_ledger" on public.wallet_ledger;
create policy "Service role full access wallet_ledger"
  on public.wallet_ledger for all
  using (auth.jwt() ->> 'role' = 'service_role');

-- Atomic: credit (deposit, game_win, referral_bonus, commission_payout, admin_adjustment positive)
-- Debit: withdrawal, game_play, subscription_payment, admin_adjustment negative.
-- amount: positive = credit, negative = debit (so one column for both directions)
create or replace function public.wallet_ledger_entry(
  p_user_id uuid,
  p_type text,
  p_amount_cents bigint,
  p_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current bigint;
  v_balance_after bigint;
  v_ledger_id uuid;
  v_valid_types text[] := array[
    'deposit','withdrawal','game_play','game_win','referral_bonus',
    'subscription_payment','commission_payout','admin_adjustment'
  ];
begin
  if p_type is null or not (p_type = any(v_valid_types)) then
    return jsonb_build_object('success', false, 'message', 'Invalid type');
  end if;
  if p_amount_cents = 0 then
    return jsonb_build_object('success', false, 'message', 'Amount cannot be zero');
  end if;
  if p_reference is not null and trim(p_reference) != '' then
    if exists (select 1 from public.wallet_ledger where reference = p_reference) then
      return jsonb_build_object('success', false, 'message', 'Duplicate transaction');
    end if;
  end if;

  insert into public.wallet_balances (user_id, balance, updated_at)
  values (p_user_id, 0, now())
  on conflict (user_id) do nothing;

  select balance into v_current
  from public.wallet_balances
  where user_id = p_user_id
  for update;

  if v_current is null then
    return jsonb_build_object('success', false, 'message', 'User balance row not found');
  end if;

  v_balance_after := v_current + p_amount_cents;

  if v_balance_after < 0 then
    return jsonb_build_object('success', false, 'message', 'Insufficient balance');
  end if;

  insert into public.wallet_ledger (user_id, type, amount, balance_after, reference)
  values (p_user_id, p_type, p_amount_cents, v_balance_after, nullif(trim(p_reference), ''))
  returning id into v_ledger_id;

  update public.wallet_balances
  set balance = v_balance_after, updated_at = now()
  where user_id = p_user_id;

  return jsonb_build_object(
    'success', true,
    'balance_cents', v_balance_after,
    'ledger_id', v_ledger_id
  );
end;
$$;

comment on function public.wallet_ledger_entry is 'Atomic wallet movement: insert ledger, update balance. amount positive=credit, negative=debit. reference prevents duplicates.';

-- Optional: sync users.balance from wallet_balances for backward compatibility (trigger after wallet_balances update)
create or replace function public.sync_users_balance_from_wallet()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.users
  set balance = new.balance, updated_at = now()
  where id = new.user_id;
  return new;
end;
$$;

drop trigger if exists sync_users_balance_from_wallet_trigger on public.wallet_balances;
create trigger sync_users_balance_from_wallet_trigger
  after insert or update of balance on public.wallet_balances
  for each row execute procedure public.sync_users_balance_from_wallet();

-- Backfill wallet_balances from existing users.balance (one-time)
insert into public.wallet_balances (user_id, balance, updated_at)
select id, coalesce(balance, 0)::bigint, now()
from public.users
where balance is not null and (balance::bigint) >= 0
on conflict (user_id) do update set
  balance = greatest(public.wallet_balances.balance, excluded.balance),
  updated_at = now();
