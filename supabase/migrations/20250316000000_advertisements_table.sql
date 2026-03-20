-- Advertisements: display ads (banner/video) with placement and impression/click tracking.
-- Storage bucket "ads" for admin uploads (jpg, png, mp4).

create table if not exists public.advertisements (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  description text not null default '',
  ad_type text not null check (ad_type in ('banner', 'video')),
  file_url text,
  target_url text,
  placement text not null check (placement in ('homepage', 'dashboard', 'fight_arena')),
  active boolean not null default true,
  impressions integer not null default 0,
  clicks integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists advertisements_placement_active on public.advertisements (placement, active) where active = true;
create index if not exists advertisements_created_at on public.advertisements (created_at desc);

comment on table public.advertisements is 'Display ads: banner/video with placement and impression/click tracking';

alter table public.advertisements enable row level security;

-- Public read for active ads (used by frontend to display ads)
drop policy if exists "Anyone can read active advertisements" on public.advertisements;
create policy "Anyone can read active advertisements"
  on public.advertisements for select
  using (active = true);

-- Only service role can insert/update/delete (admin API uses service role)
drop policy if exists "Service role full access advertisements" on public.advertisements;
create policy "Service role full access advertisements"
  on public.advertisements for all
  using (auth.jwt() ->> 'role' = 'service_role')
  with check (auth.jwt() ->> 'role' = 'service_role');

-- Storage bucket "ads" for banner images and videos (jpg, png, mp4)
-- Run as migration; bucket may already exist from previous setup
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ads',
  'ads',
  true,
  52428800,
  array['image/jpeg', 'image/png', 'video/mp4']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 52428800,
  allowed_mime_types = array['image/jpeg', 'image/png', 'video/mp4'];

-- Allow authenticated uploads to ads bucket (admin uploads via API with service role)
-- Service role bypasses RLS; allow anon/authenticated read for public URLs
drop policy if exists "Public read ads bucket" on storage.objects;
create policy "Public read ads bucket"
  on storage.objects for select
  using (bucket_id = 'ads');

drop policy if exists "Service role full access ads bucket" on storage.objects;
create policy "Service role full access ads bucket"
  on storage.objects for all
  using (bucket_id = 'ads' and (auth.jwt() ->> 'role' = 'service_role'))
  with check (bucket_id = 'ads' and (auth.jwt() ->> 'role' = 'service_role'));
