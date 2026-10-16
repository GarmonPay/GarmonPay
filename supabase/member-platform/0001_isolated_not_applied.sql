-- Isolated schema for the member workspace. Economics version 2026-10-16-launch-config.
-- Do not apply this file to production project zfnwypoxggqpairmwnja.
-- Do not place it in supabase/migrations. Do not db push.
-- No DROP, DELETE, TRUNCATE, or grants to anon/authenticated.
-- No gp_sol_* function changes.
-- Rollback, if these tables were created only by this file: 0001_isolated_not_applied_rollback.sql

create table if not exists member_platform_profiles (
  id uuid primary key,
  handle text not null unique,
  display_name text not null,
  biography text not null default '',
  invite_code text not null unique,
  referred_by uuid references member_platform_profiles (id),
  verified boolean not null default false,
  profile_public boolean not null default true,
  wallet_address text,
  created_at timestamptz not null default now(),
  constraint member_platform_wallet_optional check (wallet_address is null or wallet_address ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$')
);

create table if not exists member_platform_campaigns (
  id uuid primary key,
  owner_id uuid not null references member_platform_profiles (id),
  title text not null,
  destination_url text not null,
  tier text not null check (tier in ('seconds5', 'seconds15', 'seconds30', 'seconds60')),
  views integer not null check (views = 1000),
  price_microusd numeric not null check (price_microusd in (9990000, 14990000, 24990000)),
  status text not null default 'draft',
  payment_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists member_platform_commission_events (
  id uuid primary key,
  referrer_id uuid not null references member_platform_profiles (id),
  advertiser_id uuid not null references member_platform_profiles (id),
  purchase_id text not null unique,
  gross_lamports numeric not null check (gross_lamports > 0),
  commission_lamports numeric not null check (commission_lamports >= 0),
  rate_bps integer not null check (rate_bps in (1000, 500)),
  sequence text not null check (sequence in ('first', 'subsequent')),
  prior_qualifying_purchases integer not null check (prior_qualifying_purchases >= 0),
  refunded_lamports numeric not null default 0 check (refunded_lamports >= 0),
  status text not null check (status in ('eligible', 'reversed')),
  economics_version text not null,
  payouts_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  constraint member_platform_no_self_referral check (referrer_id <> advertiser_id),
  constraint member_platform_refund_within_gross check (refunded_lamports <= gross_lamports)
);

comment on table member_platform_commission_events is
  'Advertiser commission is 1000 bps on the first eligible purchase and 500 bps after that. Viewer match is 5000 bps and is not stored as a reduction of the viewer reward. payouts_enabled stays false.';
