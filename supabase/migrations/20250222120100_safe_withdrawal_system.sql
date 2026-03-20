-- GarmonPay: Safe withdrawal system — wallet fields, withdrawals schema, request/approve/reject, fraud limits, platform revenue.

-- ========== PART 1 — WALLET FIELDS ON USERS ==========
alter table public.users add column if not exists withdrawable_balance numeric not null default 0;
alter table public.users add column if not exists pending_balance numeric not null default 0;
alter table public.users add column if not exists lifetime_earnings numeric not null default 0;
comment on column public.users.withdrawable_balance is 'Balance available for withdrawal (cents)';
comment on column public.users.pending_balance is 'Balance locked in pending withdrawals (cents)';
comment on column public.users.lifetime_earnings is 'Total earnings (cents)';

-- Backfill: existing users get withdrawable_balance = balance so they can withdraw
update public.users
set withdrawable_balance = greatest(0, coalesce(balance::numeric, 0))
where withdrawable_balance = 0 and coalesce(balance, 0) > 0;

-- ========== PART 2 — WITHDRAWALS TABLE (add columns) ==========
alter table public.withdrawals add column if not exists platform_fee numeric not null default 0;
alter table public.withdrawals add column if not exists net_amount numeric not null default 0;
alter table public.withdrawals add column if not exists processed_at timestamptz;
alter table public.withdrawals add column if not exists ip_address text;

-- Backfill net_amount for existing rows (amount was full amount; no fee historically)
update public.withdrawals
set net_amount = amount::numeric, platform_fee = 0
where net_amount = 0 and amount is not null;

-- ========== PART 9 — PLATFORM REVENUE (ensure withdrawal_fee source supported) ==========
-- Table already exists in fight_arena migration; ensure service role can insert (already has policy).

-- ========== PART 3 — REQUEST WITHDRAWAL (with fraud protection) ==========
-- Min $10 = 1000 cents. Fee 10%. Max 3 per day. 5 min between requests. Log IP.
create or replace function public.request_withdrawal(
  p_user_id uuid,
  p_amount_cents bigint,
  p_method text,
  p_wallet_address text,
  p_ip_address text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_withdrawable numeric;
  v_platform_fee numeric;
  v_net_amount numeric;
  v_row public.withdrawals%rowtype;
  v_today_count int;
  v_last_created timestamptz;
  min_cents bigint := 1000;
  max_per_day int := 3;
  cooldown_min interval := interval '5 minutes';
begin
  if p_amount_cents is null or p_amount_cents < min_cents then
    return jsonb_build_object('success', false, 'message', 'Minimum withdrawal is $10.00');
  end if;
  if p_method is null or p_method not in ('crypto', 'paypal', 'bank') then
    return jsonb_build_object('success', false, 'message', 'Invalid method');
  end if;
  if p_wallet_address is null or trim(p_wallet_address) = '' then
    return jsonb_build_object('success', false, 'message', 'Wallet address required');
  end if;

  select withdrawable_balance into v_withdrawable from public.users where id = p_user_id for update;
  if v_withdrawable is null then
    return jsonb_build_object('success', false, 'message', 'User not found');
  end if;
  if v_withdrawable < p_amount_cents then
    return jsonb_build_object('success', false, 'message', 'Insufficient withdrawable balance');
  end if;

  select count(*) into v_today_count
  from public.withdrawals
  where user_id = p_user_id
    and created_at >= date_trunc('day', now())
    and status in ('pending', 'approved', 'paid');
  if v_today_count >= max_per_day then
    return jsonb_build_object('success', false, 'message', 'Maximum 3 withdrawals per day. Try again tomorrow.');
  end if;

  select max(created_at) into v_last_created
  from public.withdrawals
  where user_id = p_user_id and status in ('pending', 'approved', 'paid');
  if v_last_created is not null and (now() - v_last_created) < cooldown_min then
    return jsonb_build_object('success', false, 'message', 'Please wait 5 minutes between withdrawal requests.');
  end if;

  v_platform_fee := round(p_amount_cents * 0.10);
  v_net_amount := p_amount_cents - v_platform_fee;

  update public.users
  set withdrawable_balance = withdrawable_balance - p_amount_cents,
      pending_balance = pending_balance + p_amount_cents,
      updated_at = now()
  where id = p_user_id;

  insert into public.withdrawals (
    user_id, amount, platform_fee, net_amount, status, method, wallet_address, ip_address
  )
  values (
    p_user_id, p_amount_cents, v_platform_fee, v_net_amount, 'pending', p_method,
    trim(p_wallet_address), nullif(trim(coalesce(p_ip_address, '')), '')
  )
  returning * into v_row;

  return jsonb_build_object(
    'success', true,
    'withdrawal', jsonb_build_object(
      'id', v_row.id,
      'amount', v_row.amount,
      'platform_fee', v_row.platform_fee,
      'net_amount', v_row.net_amount,
      'status', v_row.status,
      'method', v_row.method,
      'wallet_address', v_row.wallet_address,
      'created_at', v_row.created_at
    )
  );
end;
$$;

-- Reject: return amount to withdrawable_balance, reduce pending_balance, set status rejected.
create or replace function public.reject_withdrawal(p_withdrawal_id uuid)
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

  update public.users
  set withdrawable_balance = withdrawable_balance + v_row.amount,
      pending_balance = pending_balance - v_row.amount,
      updated_at = now()
  where id = v_row.user_id;

  update public.withdrawals set status = 'rejected' where id = p_withdrawal_id;

  return jsonb_build_object('success', true);
end;
$$;

-- Approve: set status approved, processed_at, record platform revenue (withdrawal_fee).
create or replace function public.approve_withdrawal(p_withdrawal_id uuid)
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
    return jsonb_build_object('success', false, 'message', 'Only pending withdrawals can be approved');
  end if;

  update public.withdrawals
  set status = 'approved', processed_at = now()
  where id = p_withdrawal_id;

  update public.users
  set pending_balance = pending_balance - v_row.amount,
      updated_at = now()
  where id = v_row.user_id;

  if coalesce(v_row.platform_fee, 0) > 0 then
    insert into public.platform_revenue (amount, source)
    values (v_row.platform_fee, 'withdrawal_fee');
  end if;

  return jsonb_build_object('success', true, 'withdrawal', to_jsonb(v_row));
end;
$$;
