-- GarmonPay: Monthly recurring referral commission system.
-- Subscriptions, referral_commissions, tier-based commission %, idempotent monthly payouts.

-- ========== SUBSCRIPTIONS ==========
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  membership_tier text not null check (membership_tier in ('starter', 'pro', 'elite', 'vip')),
  monthly_price bigint not null,
  status text not null default 'active' check (status in ('active', 'canceled', 'past_due')),
  started_at timestamptz not null default now(),
  next_billing_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_user_id on public.subscriptions (user_id);
create index if not exists subscriptions_status_next_billing on public.subscriptions (status, next_billing_date) where status = 'active';

comment on table public.subscriptions is 'User paid subscriptions; commission paid when payment succeeds monthly';

-- ========== SUBSCRIPTION PAYMENTS (idempotency: one row per billing period) ==========
create table if not exists public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  period_end_date date not null,
  paid_at timestamptz not null default now(),
  unique(subscription_id, period_end_date)
);

create index if not exists subscription_payments_subscription_id on public.subscription_payments (subscription_id);

-- ========== COMMISSION CONFIG (admin-set % per tier) ==========
create table if not exists public.referral_commission_config (
  membership_tier text primary key check (membership_tier in ('starter', 'pro', 'elite', 'vip')),
  commission_percentage numeric(5,2) not null check (commission_percentage >= 0 and commission_percentage <= 100),
  updated_at timestamptz not null default now()
);

insert into public.referral_commission_config (membership_tier, commission_percentage) values
  ('starter', 10),
  ('pro', 15),
  ('elite', 20),
  ('vip', 25)
on conflict (membership_tier) do nothing;

-- ========== REFERRAL COMMISSIONS (one per referrer/referred/subscription; paid monthly) ==========
create table if not exists public.referral_commissions (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references public.users (id) on delete cascade,
  referred_user_id uuid not null references public.users (id) on delete cascade,
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  commission_amount bigint not null,
  last_paid_date date,
  status text not null default 'active' check (status in ('active', 'stopped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(referrer_user_id, referred_user_id, subscription_id)
);

create index if not exists referral_commissions_referrer on public.referral_commissions (referrer_user_id);
create index if not exists referral_commissions_subscription on public.referral_commissions (subscription_id);

-- Extend transactions type for referral_commission
alter table public.transactions drop constraint if exists transactions_type_check;
alter table public.transactions add constraint transactions_type_check
  check (type in (
    'earning', 'withdrawal', 'ad_credit', 'referral', 'referral_commission',
    'spin_wheel', 'mystery_box', 'streak', 'mission'
  ));

-- ========== RLS ==========
alter table public.subscriptions enable row level security;
alter table public.subscription_payments enable row level security;
alter table public.referral_commission_config enable row level security;
alter table public.referral_commissions enable row level security;

create policy "Users read own subscriptions" on public.subscriptions for select using (auth.uid() = user_id);
create policy "Service role subscriptions" on public.subscriptions for all using (auth.jwt() ->> 'role' = 'service_role');

create policy "Service role subscription_payments" on public.subscription_payments for all using (auth.jwt() ->> 'role' = 'service_role');

create policy "Anyone read commission config" on public.referral_commission_config for select using (true);
create policy "Service role commission config" on public.referral_commission_config for all using (auth.jwt() ->> 'role' = 'service_role');

create policy "Referrers read own commissions" on public.referral_commissions for select using (auth.uid() = referrer_user_id);
create policy "Service role referral_commissions" on public.referral_commissions for all using (auth.jwt() ->> 'role' = 'service_role');

-- ========== STOP COMMISSIONS WHEN SUBSCRIPTION CANCELED ==========
create or replace function public.stop_commissions_on_subscription_canceled()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'canceled' and (old.status is null or old.status != 'canceled') then
    update public.referral_commissions set status = 'stopped', updated_at = now() where subscription_id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists on_subscription_status_canceled on public.subscriptions;
create trigger on_subscription_status_canceled
  after update of status on public.subscriptions
  for each row execute procedure public.stop_commissions_on_subscription_canceled();

-- ========== PROCESS ONE SUBSCRIPTION BILLING (idempotent): pay commission, advance next_billing_date ==========
create or replace function public.process_subscription_billing(p_subscription_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub record;
  v_period_end date;
  v_referrer_id uuid;
  v_referrer_code text;
  v_pct numeric;
  v_commission_cents bigint;
  v_rc_id uuid;
begin
  select * into v_sub from public.subscriptions where id = p_subscription_id for update;
  if v_sub is null then
    return jsonb_build_object('success', false, 'message', 'Subscription not found');
  end if;
  if v_sub.status != 'active' then
    return jsonb_build_object('success', false, 'message', 'Subscription not active');
  end if;

  v_period_end := v_sub.next_billing_date;
  if v_period_end > current_date then
    return jsonb_build_object('success', false, 'message', 'Billing date not yet due');
  end if;

  -- Idempotency: already paid for this period?
  if exists (select 1 from public.subscription_payments where subscription_id = p_subscription_id and period_end_date = v_period_end) then
    return jsonb_build_object('success', false, 'message', 'Already paid for this period');
  end if;
  insert into public.subscription_payments (subscription_id, period_end_date)
  values (p_subscription_id, v_period_end);

  -- Find referrer (referred user = subscription user_id)
  select u.referred_by_code into v_referrer_code from public.users u where u.id = v_sub.user_id;
  if v_referrer_code is null or trim(v_referrer_code) = '' then
    update public.subscriptions set next_billing_date = v_period_end + interval '1 month', updated_at = now() where id = p_subscription_id;
    return jsonb_build_object('success', true, 'commissionPaid', false, 'reason', 'no_referrer');
  end if;
  select id into v_referrer_id from public.users where referral_code = v_referrer_code;
  if v_referrer_id is null or v_referrer_id = v_sub.user_id then
    update public.subscriptions set next_billing_date = v_period_end + interval '1 month', updated_at = now() where id = p_subscription_id;
    return jsonb_build_object('success', true, 'commissionPaid', false, 'reason', 'no_referrer');
  end if;

  -- Commission % for tier
  select commission_percentage into v_pct from public.referral_commission_config where membership_tier = v_sub.membership_tier;
  if v_pct is null then
    v_pct := 10;
  end if;
  v_commission_cents := round(v_sub.monthly_price * v_pct / 100)::bigint;
  if v_commission_cents <= 0 then
    update public.subscriptions set next_billing_date = v_period_end + interval '1 month', updated_at = now() where id = p_subscription_id;
    return jsonb_build_object('success', true, 'commissionPaid', false, 'reason', 'zero_commission');
  end if;

  -- Upsert referral_commission row (active)
  insert into public.referral_commissions (referrer_user_id, referred_user_id, subscription_id, commission_amount, last_paid_date, status)
  values (v_referrer_id, v_sub.user_id, p_subscription_id, v_commission_cents, v_period_end, 'active')
  on conflict (referrer_user_id, referred_user_id, subscription_id) do update set
    commission_amount = excluded.commission_amount,
    last_paid_date = v_period_end,
    updated_at = now()
  where public.referral_commissions.status = 'active';
  select id into v_rc_id from public.referral_commissions where subscription_id = p_subscription_id and referrer_user_id = v_referrer_id;

  -- If status was stopped (e.g. re-activated sub), do not pay
  if not (select (status = 'active') from public.referral_commissions where id = v_rc_id) then
    update public.subscriptions set next_billing_date = v_period_end + interval '1 month', updated_at = now() where id = p_subscription_id;
    return jsonb_build_object('success', true, 'commissionPaid', false, 'reason', 'commission_stopped');
  end if;

  update public.referral_commissions set last_paid_date = v_period_end, updated_at = now() where id = v_rc_id;

  -- Pay referrer
  update public.users set balance = balance + v_commission_cents, updated_at = now() where id = v_referrer_id;
  insert into public.transactions (user_id, type, amount, status, description, reference_id)
  values (v_referrer_id, 'referral_commission', v_commission_cents, 'completed', 'Referral commission (recurring)', v_rc_id);

  update public.subscriptions set next_billing_date = v_period_end + interval '1 month', updated_at = now() where id = p_subscription_id;

  return jsonb_build_object('success', true, 'commissionPaid', true, 'commissionCents', v_commission_cents, 'referrerId', v_referrer_id);
end;
$$;

-- ========== PROCESS ALL DUE BILLINGS (monthly cron) ==========
create or replace function public.process_all_due_referral_commissions()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub record;
  v_result jsonb;
  v_processed int := 0;
  v_paid int := 0;
begin
  for v_sub in
    select id from public.subscriptions where status = 'active' and next_billing_date <= current_date order by next_billing_date
  loop
    v_result := public.process_subscription_billing(v_sub.id);
    v_processed := v_processed + 1;
    if (v_result->>'commissionPaid')::boolean then
      v_paid := v_paid + 1;
    end if;
  end loop;
  return jsonb_build_object('success', true, 'processed', v_processed, 'commissionsPaid', v_paid);
end;
$$;
