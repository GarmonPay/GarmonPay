-- GarmonPay: wallet table for Add Funds (by email); RPC to increment balance.

create table if not exists public.wallet (
  email text primary key,
  balance numeric not null default 0,
  updated_at timestamptz not null default now()
);

comment on table public.wallet is 'Wallet balance by email (add funds from Stripe checkout)';

-- Allow membership = 'active' when set by Stripe subscription webhook
alter table public.users drop constraint if exists users_membership_check;
alter table public.users add constraint users_membership_check
  check (membership in ('starter', 'pro', 'elite', 'vip', 'active'));

create or replace function public.increment_wallet_balance(
  p_email text,
  p_amount_cents numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_email is null or p_email = '' or p_amount_cents is null or p_amount_cents <= 0 then
    return;
  end if;
  insert into public.wallet (email, balance, updated_at)
  values (p_email, p_amount_cents, now())
  on conflict (email) do update set
    balance = public.wallet.balance + p_amount_cents,
    updated_at = now();
end;
$$;

alter table public.wallet enable row level security;

create policy "Service role full access wallet"
  on public.wallet for all
  using (auth.jwt() ->> 'role' = 'service_role');
