-- Permanent referral tracking: referred_by (uuid) and referral_code format GP + 6 chars.
-- Do not drop existing data.

-- Add referred_by: referrer user id (nullable).
alter table public.users
  add column if not exists referred_by uuid references public.users (id) on delete set null;

create index if not exists users_referred_by_idx on public.users (referred_by);

comment on column public.users.referred_by is 'User who referred this user (by referral_code).';

-- Ensure referral_code format for new users: GP + 6 random chars.
-- Update trigger function (auth trigger inserts with generated code).
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  new_referral_code text;
begin
  new_referral_code := 'GP' || upper(substr(md5(random()::text), 1, 6));
  insert into public.users (id, email, referral_code)
  values (
    new.id,
    new.email,
    new_referral_code
  )
  on conflict (id) do update set
    email = excluded.email,
    updated_at = now();
  return new;
end;
$$;

-- Backfill referral_code for existing users that have null (e.g. created before this format).
update public.users
set referral_code = 'GP' || upper(substr(md5(id::text || random()::text), 1, 6))
where referral_code is null or referral_code = '';

