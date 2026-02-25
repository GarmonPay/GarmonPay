-- GarmonPay: Stripe payments and Connect (payouts).

-- 1) Stripe payments: record every successful checkout
create table if not exists public.stripe_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users (id) on delete set null,
  email text not null,
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'usd',
  transaction_id text not null unique,
  stripe_session_id text,
  stripe_payment_intent_id text,
  product_type text not null default 'payment' check (product_type in ('subscription', 'platform_access', 'upgrade', 'payment')),
  status text not null default 'completed' check (status in ('pending', 'completed', 'refunded', 'failed')),
  created_at timestamptz not null default now()
);

create index if not exists stripe_payments_user_id on public.stripe_payments (user_id);
create index if not exists stripe_payments_created_at on public.stripe_payments (created_at desc);
create index if not exists stripe_payments_transaction_id on public.stripe_payments (transaction_id);

alter table public.stripe_payments enable row level security;

create policy "Users can read own stripe_payments"
  on public.stripe_payments for select
  using (auth.uid() = user_id);

create policy "Service role full access stripe_payments"
  on public.stripe_payments for all
  using (auth.jwt() ->> 'role' = 'service_role');

-- 2) Stripe Connect: store connected account ID for payouts
alter table public.users add column if not exists stripe_account_id text;
create unique index if not exists users_stripe_account_id on public.users (stripe_account_id) where stripe_account_id is not null;
comment on column public.users.stripe_account_id is 'Stripe Connect account ID for receiving payouts';
