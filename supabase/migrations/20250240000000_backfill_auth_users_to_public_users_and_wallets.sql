-- =============================================================================
-- CRITICAL: Backfill existing auth.users into public.users and create wallets.
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

-- 2) Create wallets for all public.users that don't have one
insert into public.wallets (user_id, balance)
select
  public.users.id,
  0
from public.users
left join public.wallets on public.wallets.user_id = public.users.id
where public.wallets.user_id is null
on conflict (user_id) do nothing;
