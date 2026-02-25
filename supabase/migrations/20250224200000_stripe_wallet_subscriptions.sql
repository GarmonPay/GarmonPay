-- GarmonPay: Wallet funding product type and Stripe subscriptions (premium).

-- 1) Allow 'wallet_fund' in stripe_payments product_type
alter table public.stripe_payments drop constraint if exists stripe_payments_product_type_check;
alter table public.stripe_payments add constraint stripe_payments_product_type_check
  check (product_type in ('subscription', 'platform_access', 'upgrade', 'payment', 'wallet_fund'));

-- 2) Stripe subscriptions: link user to Stripe subscription, mark premium
create table if not exists public.stripe_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  stripe_subscription_id text not null unique,
  stripe_price_id text,
  status text not null default 'active' check (status in ('active', 'past_due', 'canceled', 'incomplete', 'trialing')),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stripe_subscriptions_user_id on public.stripe_subscriptions (user_id);
create index if not exists stripe_subscriptions_stripe_id on public.stripe_subscriptions (stripe_subscription_id);

alter table public.stripe_subscriptions enable row level security;

create policy "Users can read own stripe_subscriptions"
  on public.stripe_subscriptions for select
  using (auth.uid() = user_id);

create policy "Service role full access stripe_subscriptions"
  on public.stripe_subscriptions for all
  using (auth.jwt() ->> 'role' = 'service_role');

-- 3) Safe wallet funding: increment balance and withdrawable_balance (called from webhook)
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
  if p_amount_cents is null or p_amount_cents <= 0 then
    return;
  end if;
  update public.users
  set
    balance = coalesce(balance, 0) + p_amount_cents,
    withdrawable_balance = coalesce(withdrawable_balance, 0) + p_amount_cents,
    updated_at = now()
  where id = p_user_id;
end;
$$;
