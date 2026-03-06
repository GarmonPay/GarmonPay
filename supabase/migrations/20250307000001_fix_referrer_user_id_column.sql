-- Repair: ensure referral_commissions has referrer_user_id (fix 42703 if table was created with referrer_id elsewhere).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'referral_commissions' and column_name = 'referrer_id'
  )
  and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'referral_commissions' and column_name = 'referrer_user_id'
  ) then
    alter table public.referral_commissions add column referrer_user_id uuid references public.users (id) on delete cascade;
    update public.referral_commissions set referrer_user_id = referrer_id where referrer_id is not null;
    alter table public.referral_commissions alter column referrer_user_id set not null;
    alter table public.referral_commissions drop column referrer_id;
  end if;
end;
$$;

-- Ensure viral_referrals has referrer_user_id (if it existed with referrer_id)
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'viral_referrals'
  )
  and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'viral_referrals' and column_name = 'referrer_id'
  )
  and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'viral_referrals' and column_name = 'referrer_user_id'
  ) then
    alter table public.viral_referrals add column referrer_user_id uuid references public.users (id) on delete cascade;
    update public.viral_referrals set referrer_user_id = referrer_id where referrer_id is not null;
    alter table public.viral_referrals alter column referrer_user_id set not null;
    alter table public.viral_referrals drop column referrer_id;
  end if;
end;
$$;
