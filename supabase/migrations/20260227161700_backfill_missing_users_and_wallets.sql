-- Backfill existing auth users into public.users (trigger only handles new signups).
insert into public.users (id, email, balance)
select
  auth.users.id,
  auth.users.email,
  0
from auth.users
left join public.users
  on public.users.id = auth.users.id
where public.users.id is null
  and auth.users.email is not null;

-- Create missing wallets for users.
-- Supports both schema variants used in this codebase/history:
--   1) public.wallets(user_id, balance)
--   2) public.wallet(email, balance)
do $$
begin
  if to_regclass('public.wallets') is not null then
    execute $sql$
      insert into public.wallets (user_id, balance)
      select
        public.users.id,
        0
      from public.users
      left join public.wallets
        on public.wallets.user_id = public.users.id
      where public.wallets.user_id is null
    $sql$;
  elsif to_regclass('public.wallet') is not null then
    execute $sql$
      insert into public.wallet (email, balance)
      select
        public.users.email,
        0
      from public.users
      left join public.wallet
        on public.wallet.email = public.users.email
      where public.wallet.email is null
        and public.users.email is not null
        and public.users.email <> ''
    $sql$;
  else
    raise notice 'Skipped wallet backfill: no wallet table found.';
  end if;
end
$$;
