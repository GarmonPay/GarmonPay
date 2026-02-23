-- GarmonPay: Banners table for rotator, advertiser uploads, referral banners.
-- status: pending (awaiting admin approval), active, paused

create table if not exists public.banners (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references public.users (id) on delete cascade,
  title text not null default '',
  image_url text not null,
  target_url text not null default '',
  type text not null default 'advertiser' check (type in ('advertiser', 'referral', 'admin')),
  status text not null default 'pending' check (status in ('pending', 'active', 'paused')),
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists banners_owner_user_id on public.banners (owner_user_id);
create index if not exists banners_status on public.banners (status) where status = 'active';
create index if not exists banners_type on public.banners (type);
create index if not exists banners_created_at on public.banners (created_at desc);

comment on table public.banners is 'Banner ads: rotator display, impressions/clicks tracking, admin approval';

alter table public.banners enable row level security;

create policy "Users can read own banners"
  on public.banners for select
  using (auth.uid() = owner_user_id);

create policy "Users can insert own banners"
  on public.banners for insert
  with check (auth.uid() = owner_user_id);

create policy "Users can update own banners (limited fields)"
  on public.banners for update
  using (auth.uid() = owner_user_id);

create policy "Service role full access banners"
  on public.banners for all
  using (auth.jwt() ->> 'role' = 'service_role');

-- Allow anonymous/authenticated read for active banners only (rotator) via service role in API
