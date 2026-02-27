-- Production rebuild: advertiser ad uploads + deposits ledger + idempotent Stripe deposit sync.

-- 1) Extend ads table for advertiser submissions.
alter table public.ads
  add column if not exists user_id uuid references public.users (id) on delete set null,
  add column if not exists video_url text,
  add column if not exists image_url text,
  add column if not exists budget bigint not null default 0;

update public.ads
set video_url = media_url
where type = 'video' and video_url is null and media_url is not null;

update public.ads
set image_url = media_url
where type = 'image' and image_url is null and media_url is not null;

alter table public.ads drop constraint if exists ads_status_check;
alter table public.ads add constraint ads_status_check
  check (status in ('pending', 'approved', 'rejected', 'active', 'inactive'));

create index if not exists ads_user_id_idx on public.ads (user_id);
create index if not exists ads_status_created_idx on public.ads (status, created_at desc);

-- 2) Storage bucket for ad assets.
insert into storage.buckets (id, name, public)
values ('ads', 'ads', true)
on conflict (id) do update set public = excluded.public;

-- 3) Deposits ledger table.
create table if not exists public.deposits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  email text not null default '',
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'usd',
  status text not null default 'succeeded'
    check (status in ('pending', 'succeeded', 'failed', 'refunded')),
  stripe_session_id text unique,
  stripe_payment_intent_id text unique,
  created_at timestamptz not null default now()
);

create index if not exists deposits_user_id_idx on public.deposits (user_id);
create index if not exists deposits_created_at_idx on public.deposits (created_at desc);
create index if not exists deposits_status_idx on public.deposits (status);

alter table public.deposits enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'deposits'
      and policyname = 'Users can read own deposits'
  ) then
    create policy "Users can read own deposits"
      on public.deposits for select
      using (auth.uid() = user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'deposits'
      and policyname = 'Service role full access deposits'
  ) then
    create policy "Service role full access deposits"
      on public.deposits for all
      using (auth.jwt() ->> 'role' = 'service_role');
  end if;
end
$$;

-- 4) Idempotent function: record deposit once, then increment user balance.
create or replace function public.record_successful_deposit(
  p_user_id uuid,
  p_email text,
  p_amount_cents bigint,
  p_currency text default 'usd',
  p_stripe_session_id text default null,
  p_stripe_payment_intent_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing_id uuid;
  v_deposit_id uuid;
begin
  if p_user_id is null then
    return jsonb_build_object('inserted', false, 'message', 'user_id required');
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    return jsonb_build_object('inserted', false, 'message', 'amount must be > 0');
  end if;

  if p_stripe_session_id is not null then
    select id into v_existing_id
    from public.deposits
    where stripe_session_id = p_stripe_session_id
    limit 1;
    if v_existing_id is not null then
      return jsonb_build_object('inserted', false, 'depositId', v_existing_id);
    end if;
  end if;

  if p_stripe_payment_intent_id is not null then
    select id into v_existing_id
    from public.deposits
    where stripe_payment_intent_id = p_stripe_payment_intent_id
    limit 1;
    if v_existing_id is not null then
      return jsonb_build_object('inserted', false, 'depositId', v_existing_id);
    end if;
  end if;

  insert into public.deposits (
    user_id,
    email,
    amount_cents,
    currency,
    status,
    stripe_session_id,
    stripe_payment_intent_id
  )
  values (
    p_user_id,
    coalesce(p_email, ''),
    p_amount_cents,
    coalesce(nullif(lower(trim(coalesce(p_currency, 'usd'))), ''), 'usd'),
    'succeeded',
    p_stripe_session_id,
    p_stripe_payment_intent_id
  )
  returning id into v_deposit_id;

  begin
    update public.users
    set
      balance = coalesce(balance, 0) + p_amount_cents,
      withdrawable_balance = coalesce(withdrawable_balance, 0) + p_amount_cents,
      updated_at = now()
    where id = p_user_id;
  exception
    when undefined_column then
      update public.users
      set
        balance = coalesce(balance, 0) + p_amount_cents,
        updated_at = now()
      where id = p_user_id;
  end;

  return jsonb_build_object('inserted', true, 'depositId', v_deposit_id);
end;
$$;
