-- GarmonPay: transactions table, ad_credit_balance on users, convert-to-ad-credit, and transaction recording.

-- Add ad credit balance to users
alter table public.users
  add column if not exists ad_credit_balance bigint not null default 0;

comment on column public.users.ad_credit_balance is 'Balance reserved for ad spend; converted from main balance';

-- Transactions table
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  type text not null check (type in ('earning', 'withdrawal', 'ad_credit', 'referral')),
  amount bigint not null,
  status text not null default 'completed' check (status in ('pending', 'completed', 'rejected', 'cancelled')),
  description text default '',
  reference_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists transactions_user_id on public.transactions (user_id);
create index if not exists transactions_created_at on public.transactions (created_at desc);
create index if not exists transactions_type on public.transactions (type);

alter table public.transactions enable row level security;

create policy "Users can read own transactions"
  on public.transactions for select
  using (auth.uid() = user_id);

create policy "Service role full access transactions"
  on public.transactions for all
  using (auth.jwt() ->> 'role' = 'service_role');

-- Convert balance to ad credit (server-side only)
create or replace function public.convert_balance_to_ad_credit(
  p_user_id uuid,
  p_amount_cents bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance bigint;
begin
  if p_amount_cents is null or p_amount_cents <= 0 then
    return jsonb_build_object('success', false, 'message', 'Invalid amount');
  end if;

  select balance into v_balance from public.users where id = p_user_id for update;
  if v_balance is null then
    return jsonb_build_object('success', false, 'message', 'User not found');
  end if;
  if v_balance < p_amount_cents then
    return jsonb_build_object('success', false, 'message', 'Insufficient balance');
  end if;

  update public.users
  set balance = balance - p_amount_cents,
      ad_credit_balance = ad_credit_balance + p_amount_cents,
      updated_at = now()
  where id = p_user_id;

  insert into public.transactions (user_id, type, amount, status, description)
  values (p_user_id, 'ad_credit', p_amount_cents, 'completed', 'Converted balance to ad credit');

  return jsonb_build_object('success', true, 'amountCents', p_amount_cents);
end;
$$;

-- Update complete_ad_session_and_issue_reward to also insert transaction (earning)
create or replace function public.complete_ad_session_and_issue_reward(
  p_user_id uuid,
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session record;
  v_ad record;
  v_reward bigint;
begin
  select * into v_session from public.ad_sessions where id = p_session_id;
  if v_session is null then
    return jsonb_build_object('success', false, 'message', 'Invalid session');
  end if;
  if v_session.user_id != p_user_id then
    return jsonb_build_object('success', false, 'message', 'Unauthorized');
  end if;
  if v_session.reward_given then
    return jsonb_build_object('success', false, 'message', 'Reward already issued');
  end if;

  if (v_session.start_time + (select duration_seconds from public.ads where id = v_session.ad_id) * interval '1 second') > now() then
    return jsonb_build_object('success', false, 'message', 'Timer not complete');
  end if;

  select * into v_ad from public.ads where id = v_session.ad_id;
  if v_ad is null then
    return jsonb_build_object('success', false, 'message', 'Ad not found');
  end if;

  v_reward := v_ad.user_reward;

  update public.ad_sessions set completed = true, reward_given = true where id = p_session_id;

  update public.users set balance = balance + v_reward, updated_at = now() where id = p_user_id;

  insert into public.earnings (user_id, amount, source, reference_id)
  values (p_user_id, v_reward, 'ad', p_session_id);

  insert into public.transactions (user_id, type, amount, status, description, reference_id)
  values (p_user_id, 'earning', v_reward, 'completed', 'Ad reward', p_session_id);

  return jsonb_build_object('success', true, 'rewardCents', v_reward);
end;
$$;

-- Update submit_withdrawal to also insert transaction (withdrawal, pending)
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

  insert into public.transactions (user_id, type, amount, status, description, reference_id)
  values (p_user_id, 'withdrawal', p_amount, 'pending', 'Withdrawal request', v_row.id);

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

-- When withdrawal is rejected, optionally update the related transaction to rejected (and we refund in reject_withdrawal)
-- We don't have a direct link from transaction to withdrawal in the function; reference_id stores withdrawal id.
-- So in reject_withdrawal we can update the transaction where reference_id = p_withdrawal_id set status = 'rejected'.
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

  update public.transactions
  set status = 'rejected', description = 'Withdrawal rejected - balance refunded'
  where reference_id = p_withdrawal_id and type = 'withdrawal';

  return jsonb_build_object('success', true);
end;
$$;
