-- GarmonPay: add_funds RPC (for Stripe webhook) and revenue_transactions for admin dashboard.

-- 1) add_funds: add amount (dollars) to wallet by email; create row if missing
create or replace function public.add_funds(user_email text, amount numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if user_email is null or user_email = '' or amount is null or amount <= 0 then
    return;
  end if;
  insert into public.wallet (email, balance, updated_at)
  values (user_email, amount, now())
  on conflict (email) do update set
    balance = public.wallet.balance + amount,
    updated_at = now();
end;
$$;

-- 2) Admin revenue tracking: Stripe payments and subscriptions
create table if not exists public.revenue_transactions (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  amount numeric not null,
  type text not null check (type in ('payment', 'subscription')),
  created_at timestamptz not null default now()
);

create index if not exists revenue_transactions_created_at on public.revenue_transactions (created_at desc);
create index if not exists revenue_transactions_email on public.revenue_transactions (email);

alter table public.revenue_transactions enable row level security;

create policy "Service role full access revenue_transactions"
  on public.revenue_transactions for all
  using (auth.jwt() ->> 'role' = 'service_role');
