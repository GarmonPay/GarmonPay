-- =============================================================================
-- CRITICAL: Backfill existing auth.users into public.users and create wallet rows.
-- Run in Supabase SQL Editor or: supabase db push
-- Trigger only affects NEW signups; this fixes existing users.
-- =============================================================================

-- 1) Insert all existing auth.users into public.users where missing
insert into public.users (id, email, role, balance, created_at)
select
  auth.users.id,
  auth.users.email,
  'user',
  0,
  coalesce(auth.users.created_at, now())
from auth.users
left join public.users on public.users.id = auth.users.id
where public.users.id is null
on conflict (id) do update set email = excluded.email;

-- 2) Create wallet rows for all public.users that don't have one
insert into public.wallet (user_id, balance, updated_at)
select
  public.users.id,
  0,
  now()
from public.users
left join public.wallet on public.wallet.user_id = public.users.id
where public.wallet.user_id is null
on conflict (user_id) do nothing;
