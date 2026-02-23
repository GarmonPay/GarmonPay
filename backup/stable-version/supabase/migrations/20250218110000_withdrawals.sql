-- GarmonPay: withdrawals table and secure submit/reject logic.

create table if not exists public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  amount bigint not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'paid')),
  method text not null check (method in ('crypto', 'paypal', 'bank')),
  wallet_address text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists withdrawals_user_id on public.withdrawals (user_id);
create index if not exists withdrawals_status on public.withdrawals (status);
create index if not exists withdrawals_created_at on public.withdrawals (created_at desc);

-- Minimum withdrawal (cents). Enforce in app or default 100 = $1
comment on table public.withdrawals is 'User withdrawal requests; balance deducted on submit, refunded if rejected';

alter table public.withdrawals enable row level security;

create policy "Users can read own withdrawals"
  on public.withdrawals for select
  using (auth.uid() = user_id);

create policy "Users can insert own withdrawals (via service role in practice)"
  on public.withdrawals for insert
  with check (auth.uid() = user_id);

create policy "Service role full access withdrawals"
  on public.withdrawals for all
  using (auth.jwt() ->> 'role' = 'service_role');

-- Submit withdrawal: check balance and minimum, deduct, insert. Prevents overspend and race.
create or replace function public.submit_withdrawal(
  p_user_id uuid,
  p_amount bigint,
  p_method text,
  p_wallet_address text,
  p_min_amount bigint default 100
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance bigint;
  v_row public.withdrawals%rowtype;
begin
  if p_amount is null or p_amount < p_min_amount then
    return jsonb_build_object('success', false, 'message', 'Amount below minimum');
  end if;
  if p_method is null or p_method not in ('crypto', 'paypal', 'bank') then
    return jsonb_build_object('success', false, 'message', 'Invalid method');
  end if;
  if p_wallet_address is null or trim(p_wallet_address) = '' then
    return jsonb_build_object('success', false, 'message', 'Wallet address required');
  end if;

  select balance into v_balance from public.users where id = p_user_id for update;
  if v_balance is null then
    return jsonb_build_object('success', false, 'message', 'User not found');
  end if;
  if v_balance < p_amount then
    return jsonb_build_object('success', false, 'message', 'Insufficient balance');
  end if;

  update public.users set balance = balance - p_amount, updated_at = now() where id = p_user_id;

  insert into public.withdrawals (user_id, amount, status, method, wallet_address)
  values (p_user_id, p_amount, 'pending', p_method, trim(p_wallet_address))
  returning * into v_row;

  return jsonb_build_object(
    'success', true,
    'withdrawal', jsonb_build_object(
      'id', v_row.id,
      'amount', v_row.amount,
      'status', v_row.status,
      'method', v_row.method,
      'wallet_address', v_row.wallet_address,
      'created_at', v_row.created_at
    )
  );
end;
$$;

-- Reject withdrawal: refund balance, set status rejected. Only for pending.
create or replace function public.reject_withdrawal(
  p_withdrawal_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.withdrawals%rowtype;
begin
  select * into v_row from public.withdrawals where id = p_withdrawal_id for update;
  if v_row is null then
    return jsonb_build_object('success', false, 'message', 'Withdrawal not found');
  end if;
  if v_row.status != 'pending' then
    return jsonb_build_object('success', false, 'message', 'Only pending withdrawals can be rejected');
  end if;

  update public.users set balance = balance + v_row.amount, updated_at = now() where id = v_row.user_id;
  update public.withdrawals set status = 'rejected' where id = p_withdrawal_id;

  return jsonb_build_object('success', true);
end;
$$;
