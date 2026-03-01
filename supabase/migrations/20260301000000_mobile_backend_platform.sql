-- =============================================================================
-- GarmonPay mobile/backend platform foundation
-- - Wallet ledger consistency
-- - Reward events
-- - Withdrawals workflow
-- - Analytics event tracking
-- - Stripe deposit reconciliation
-- =============================================================================

-- -------------------------
-- Wallets hardening
-- -------------------------
create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  balance numeric not null default 0,
  rewards_earned numeric not null default 0,
  total_withdrawn numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

alter table public.wallets add column if not exists rewards_earned numeric not null default 0;
alter table public.wallets add column if not exists total_withdrawn numeric not null default 0;
alter table public.wallets add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_wallets_user_id on public.wallets(user_id);

-- -------------------------
-- Transactions hardening
-- -------------------------
alter table public.transactions add column if not exists status text not null default 'completed';
alter table public.transactions add column if not exists description text;
alter table public.transactions add column if not exists reference_id text;
alter table public.transactions add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_transactions_user_created_at on public.transactions(user_id, created_at desc);
create index if not exists idx_transactions_reference on public.transactions(reference_id);

-- -------------------------
-- Withdrawals extension
-- -------------------------
alter table public.withdrawals add column if not exists payment_method text;
alter table public.withdrawals add column if not exists admin_note text;
alter table public.withdrawals add column if not exists requested_at timestamptz;
alter table public.withdrawals add column if not exists processed_at timestamptz;
alter table public.withdrawals add column if not exists processed_by uuid references public.users(id) on delete set null;
alter table public.withdrawals add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.withdrawals
set requested_at = coalesce(requested_at, created_at, now())
where requested_at is null;

update public.withdrawals
set payment_method = coalesce(payment_method, method, 'bank')
where payment_method is null;

create index if not exists idx_withdrawals_user_requested_at on public.withdrawals(user_id, requested_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'withdrawals_status_allowed'
  ) then
    alter table public.withdrawals
      add constraint withdrawals_status_allowed
      check (status in ('pending', 'approved', 'rejected', 'paid'));
  end if;
end $$;

-- -------------------------
-- Reward events
-- -------------------------
create table if not exists public.reward_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  amount numeric not null check (amount > 0),
  event_type text not null,
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_reward_events_user_created_at on public.reward_events(user_id, created_at desc);
create unique index if not exists ux_reward_events_user_idempotency
  on public.reward_events(user_id, idempotency_key)
  where idempotency_key is not null;

-- -------------------------
-- Analytics events
-- -------------------------
create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  event_type text not null,
  source text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_analytics_events_created_at on public.analytics_events(created_at desc);
create index if not exists idx_analytics_events_event_type on public.analytics_events(event_type);
create index if not exists idx_analytics_events_user_id on public.analytics_events(user_id);

-- -------------------------
-- RLS for new tables
-- -------------------------
alter table public.reward_events enable row level security;
alter table public.analytics_events enable row level security;

drop policy if exists "Users can read own reward events" on public.reward_events;
create policy "Users can read own reward events"
  on public.reward_events for select
  using (auth.uid() = user_id);

drop policy if exists "Service role full access reward events" on public.reward_events;
create policy "Service role full access reward events"
  on public.reward_events for all
  using (auth.jwt() ->> 'role' = 'service_role')
  with check (auth.jwt() ->> 'role' = 'service_role');

drop policy if exists "Users can read own analytics events" on public.analytics_events;
create policy "Users can read own analytics events"
  on public.analytics_events for select
  using (auth.uid() = user_id);

drop policy if exists "Service role full access analytics events" on public.analytics_events;
create policy "Service role full access analytics events"
  on public.analytics_events for all
  using (auth.jwt() ->> 'role' = 'service_role')
  with check (auth.jwt() ->> 'role' = 'service_role');

-- -------------------------
-- Wallet bootstrap helper
-- -------------------------
create or replace function public.gp_ensure_wallet(p_user_id uuid)
returns public.wallets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.wallets;
begin
  insert into public.users (id, email, role, is_super_admin, created_at)
  select au.id, au.email, 'user', false, now()
  from auth.users au
  where au.id = p_user_id
  on conflict (id) do nothing;

  insert into public.wallets (user_id, balance, rewards_earned, total_withdrawn, created_at, updated_at)
  values (p_user_id, 0, 0, 0, now(), now())
  on conflict (user_id) do update set updated_at = now();

  select *
  into v_wallet
  from public.wallets
  where user_id = p_user_id;

  return v_wallet;
end;
$$;

grant execute on function public.gp_ensure_wallet(uuid) to authenticated, service_role;

-- -------------------------
-- Reward credit (atomic)
-- -------------------------
create or replace function public.gp_credit_reward(
  p_user_id uuid,
  p_amount numeric,
  p_event_type text,
  p_idempotency_key text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.wallets;
  v_reward_id uuid;
  v_tx_id uuid;
begin
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('error', 'Invalid amount');
  end if;

  if p_event_type is null or length(trim(p_event_type)) = 0 then
    return jsonb_build_object('error', 'event_type is required');
  end if;

  perform public.gp_ensure_wallet(p_user_id);

  if p_idempotency_key is not null then
    select id
    into v_reward_id
    from public.reward_events
    where user_id = p_user_id
      and idempotency_key = p_idempotency_key
    limit 1;

    if v_reward_id is not null then
      select *
      into v_wallet
      from public.wallets
      where user_id = p_user_id;

      select id
      into v_tx_id
      from public.transactions
      where user_id = p_user_id
        and type = 'reward'
        and reference_id = v_reward_id::text
      order by created_at desc
      limit 1;

      return jsonb_build_object(
        'reward_event_id', v_reward_id,
        'transaction_id', v_tx_id,
        'balance', coalesce(v_wallet.balance, 0),
        'rewards_earned', coalesce(v_wallet.rewards_earned, 0)
      );
    end if;
  end if;

  select *
  into v_wallet
  from public.wallets
  where user_id = p_user_id
  for update;

  update public.wallets
  set balance = coalesce(balance, 0) + p_amount,
      rewards_earned = coalesce(rewards_earned, 0) + p_amount,
      updated_at = now()
  where user_id = p_user_id
  returning * into v_wallet;

  update public.users
  set balance = coalesce(balance, 0) + p_amount,
      updated_at = now()
  where id = p_user_id;

  insert into public.reward_events (
    user_id, amount, event_type, idempotency_key, metadata
  )
  values (
    p_user_id, p_amount, trim(p_event_type), p_idempotency_key, coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_reward_id;

  insert into public.transactions (
    user_id, type, amount, status, description, reference_id, metadata, created_at
  )
  values (
    p_user_id,
    'reward',
    p_amount,
    'completed',
    'Reward credit: ' || trim(p_event_type),
    v_reward_id::text,
    jsonb_build_object('event_type', trim(p_event_type)),
    now()
  )
  returning id into v_tx_id;

  return jsonb_build_object(
    'reward_event_id', v_reward_id,
    'transaction_id', v_tx_id,
    'balance', coalesce(v_wallet.balance, 0),
    'rewards_earned', coalesce(v_wallet.rewards_earned, 0)
  );
exception
  when unique_violation then
    if p_idempotency_key is not null then
      select id
      into v_reward_id
      from public.reward_events
      where user_id = p_user_id
        and idempotency_key = p_idempotency_key
      limit 1;

      select *
      into v_wallet
      from public.wallets
      where user_id = p_user_id;

      select id
      into v_tx_id
      from public.transactions
      where user_id = p_user_id
        and type = 'reward'
        and reference_id = v_reward_id::text
      order by created_at desc
      limit 1;

      return jsonb_build_object(
        'reward_event_id', v_reward_id,
        'transaction_id', v_tx_id,
        'balance', coalesce(v_wallet.balance, 0),
        'rewards_earned', coalesce(v_wallet.rewards_earned, 0)
      );
    end if;

    return jsonb_build_object('error', 'Reward already processed');
end;
$$;

grant execute on function public.gp_credit_reward(uuid, numeric, text, text, jsonb) to authenticated, service_role;

-- -------------------------
-- Withdrawal request (atomic)
-- -------------------------
create or replace function public.gp_request_withdrawal(
  p_user_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.wallets;
  v_withdrawal public.withdrawals%rowtype;
  v_tx_id uuid;
  v_legacy_method text;
begin
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('error', 'Invalid amount');
  end if;

  if p_payment_method is null or length(trim(p_payment_method)) = 0 then
    return jsonb_build_object('error', 'paymentMethod is required');
  end if;

  perform public.gp_ensure_wallet(p_user_id);

  select *
  into v_wallet
  from public.wallets
  where user_id = p_user_id
  for update;

  if coalesce(v_wallet.balance, 0) < p_amount then
    return jsonb_build_object('error', 'Insufficient wallet balance');
  end if;

  v_legacy_method := case
    when lower(trim(p_payment_method)) in ('crypto', 'paypal', 'bank') then lower(trim(p_payment_method))
    else 'bank'
  end;

  update public.wallets
  set balance = coalesce(balance, 0) - p_amount,
      total_withdrawn = coalesce(total_withdrawn, 0) + p_amount,
      updated_at = now()
  where user_id = p_user_id
  returning * into v_wallet;

  update public.users
  set balance = greatest(0, coalesce(balance, 0) - p_amount),
      updated_at = now()
  where id = p_user_id;

  insert into public.withdrawals (
    user_id,
    amount,
    status,
    method,
    wallet_address,
    payment_method,
    requested_at,
    metadata
  )
  values (
    p_user_id,
    p_amount,
    'pending',
    v_legacy_method,
    coalesce(p_metadata->>'account', ''),
    trim(p_payment_method),
    now(),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into v_withdrawal;

  insert into public.transactions (
    user_id,
    type,
    amount,
    status,
    description,
    reference_id,
    metadata,
    created_at
  )
  values (
    p_user_id,
    'withdrawal',
    p_amount,
    'pending',
    'Withdrawal requested',
    v_withdrawal.id::text,
    jsonb_build_object('payment_method', trim(p_payment_method)),
    now()
  )
  returning id into v_tx_id;

  return jsonb_build_object(
    'withdrawal', to_jsonb(v_withdrawal),
    'transaction_id', v_tx_id,
    'balance', coalesce(v_wallet.balance, 0)
  );
end;
$$;

grant execute on function public.gp_request_withdrawal(uuid, numeric, text, jsonb) to authenticated, service_role;

-- -------------------------
-- Admin manual wallet credit
-- -------------------------
create or replace function public.gp_admin_manual_credit(
  p_admin_user_id uuid,
  p_user_id uuid,
  p_amount numeric,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_is_super_admin boolean;
  v_wallet public.wallets;
  v_tx_id uuid;
begin
  select role, is_super_admin
  into v_role, v_is_super_admin
  from public.users
  where id = p_admin_user_id;

  if coalesce(lower(v_role), '') <> 'admin' and coalesce(v_is_super_admin, false) is not true then
    return jsonb_build_object('error', 'Forbidden');
  end if;

  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('error', 'Invalid amount');
  end if;

  perform public.gp_ensure_wallet(p_user_id);

  select *
  into v_wallet
  from public.wallets
  where user_id = p_user_id
  for update;

  update public.wallets
  set balance = coalesce(balance, 0) + p_amount,
      updated_at = now()
  where user_id = p_user_id
  returning * into v_wallet;

  update public.users
  set balance = coalesce(balance, 0) + p_amount,
      updated_at = now()
  where id = p_user_id;

  insert into public.transactions (
    user_id,
    type,
    amount,
    status,
    description,
    reference_id,
    metadata,
    created_at
  )
  values (
    p_user_id,
    'manual_credit',
    p_amount,
    'completed',
    coalesce(nullif(trim(p_reason), ''), 'Manual admin credit'),
    p_admin_user_id::text,
    jsonb_build_object('admin_user_id', p_admin_user_id),
    now()
  )
  returning id into v_tx_id;

  return jsonb_build_object(
    'transaction_id', v_tx_id,
    'balance', coalesce(v_wallet.balance, 0)
  );
end;
$$;

grant execute on function public.gp_admin_manual_credit(uuid, uuid, numeric, text) to service_role;

-- -------------------------
-- Admin withdrawal processing
-- -------------------------
create or replace function public.gp_admin_process_withdrawal(
  p_admin_user_id uuid,
  p_withdrawal_id uuid,
  p_status text,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_is_super_admin boolean;
  v_withdrawal public.withdrawals%rowtype;
  v_wallet public.wallets;
begin
  select role, is_super_admin
  into v_role, v_is_super_admin
  from public.users
  where id = p_admin_user_id;

  if coalesce(lower(v_role), '') <> 'admin' and coalesce(v_is_super_admin, false) is not true then
    return jsonb_build_object('error', 'Forbidden');
  end if;

  if p_status is null or lower(trim(p_status)) not in ('approved', 'rejected', 'paid') then
    return jsonb_build_object('error', 'Invalid status');
  end if;

  select *
  into v_withdrawal
  from public.withdrawals
  where id = p_withdrawal_id
  for update;

  if v_withdrawal.id is null then
    return jsonb_build_object('error', 'Withdrawal not found');
  end if;

  if lower(trim(p_status)) = 'approved' then
    if v_withdrawal.status <> 'pending' then
      return jsonb_build_object('error', 'Only pending withdrawals can be approved');
    end if;

    update public.withdrawals
    set status = 'approved',
        admin_note = p_admin_note,
        processed_at = now(),
        processed_by = p_admin_user_id
    where id = p_withdrawal_id;

    update public.transactions
    set status = 'approved',
        description = 'Withdrawal approved'
    where reference_id = p_withdrawal_id::text
      and type = 'withdrawal';

    return jsonb_build_object('ok', true);
  end if;

  if lower(trim(p_status)) = 'paid' then
    if v_withdrawal.status <> 'approved' then
      return jsonb_build_object('error', 'Only approved withdrawals can be marked paid');
    end if;

    update public.withdrawals
    set status = 'paid',
        admin_note = coalesce(p_admin_note, admin_note),
        processed_at = now(),
        processed_by = p_admin_user_id
    where id = p_withdrawal_id;

    update public.transactions
    set status = 'completed',
        description = 'Withdrawal paid'
    where reference_id = p_withdrawal_id::text
      and type = 'withdrawal';

    return jsonb_build_object('ok', true);
  end if;

  if v_withdrawal.status not in ('pending', 'approved') then
    return jsonb_build_object('error', 'Only pending or approved withdrawals can be rejected');
  end if;

  perform public.gp_ensure_wallet(v_withdrawal.user_id);

  select *
  into v_wallet
  from public.wallets
  where user_id = v_withdrawal.user_id
  for update;

  update public.wallets
  set balance = coalesce(balance, 0) + coalesce(v_withdrawal.amount, 0),
      total_withdrawn = greatest(0, coalesce(total_withdrawn, 0) - coalesce(v_withdrawal.amount, 0)),
      updated_at = now()
  where user_id = v_withdrawal.user_id;

  update public.users
  set balance = coalesce(balance, 0) + coalesce(v_withdrawal.amount, 0),
      updated_at = now()
  where id = v_withdrawal.user_id;

  update public.withdrawals
  set status = 'rejected',
      admin_note = p_admin_note,
      processed_at = now(),
      processed_by = p_admin_user_id
  where id = p_withdrawal_id;

  update public.transactions
  set status = 'rejected',
      description = 'Withdrawal rejected'
  where reference_id = p_withdrawal_id::text
    and type = 'withdrawal';

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.gp_admin_process_withdrawal(uuid, uuid, text, text) to service_role;

-- -------------------------
-- Stripe deposit application
-- -------------------------
create or replace function public.gp_apply_stripe_deposit(
  p_user_id uuid,
  p_amount numeric,
  p_reference_id text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.wallets;
  v_existing_tx uuid;
  v_tx_id uuid;
begin
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('error', 'Invalid amount');
  end if;
  if p_reference_id is null or length(trim(p_reference_id)) = 0 then
    return jsonb_build_object('error', 'Missing Stripe reference id');
  end if;

  perform pg_advisory_xact_lock(hashtext(trim(p_reference_id)));

  select id
  into v_existing_tx
  from public.transactions
  where type = 'deposit'
    and reference_id = trim(p_reference_id)
  limit 1;

  if v_existing_tx is not null then
    return jsonb_build_object('transaction_id', v_existing_tx, 'duplicate', true);
  end if;

  perform public.gp_ensure_wallet(p_user_id);

  select *
  into v_wallet
  from public.wallets
  where user_id = p_user_id
  for update;

  update public.wallets
  set balance = coalesce(balance, 0) + p_amount,
      updated_at = now()
  where user_id = p_user_id
  returning * into v_wallet;

  update public.users
  set balance = coalesce(balance, 0) + p_amount,
      updated_at = now()
  where id = p_user_id;

  insert into public.transactions (
    user_id, type, amount, status, description, reference_id, metadata, created_at
  )
  values (
    p_user_id,
    'deposit',
    p_amount,
    'completed',
    'Stripe deposit',
    trim(p_reference_id),
    coalesce(p_metadata, '{}'::jsonb),
    now()
  )
  returning id into v_tx_id;

  return jsonb_build_object('transaction_id', v_tx_id, 'balance', coalesce(v_wallet.balance, 0));
end;
$$;

grant execute on function public.gp_apply_stripe_deposit(uuid, numeric, text, jsonb) to service_role;
