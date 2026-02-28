-- Production: advertiser ads columns + storage bucket.
-- Ads table: ensure user_id, title, description, video_url, image_url, budget exist.

alter table public.ads add column if not exists user_id uuid references public.users(id) on delete set null;
alter table public.ads add column if not exists title text;
alter table public.ads add column if not exists description text default '';
alter table public.ads add column if not exists video_url text;
alter table public.ads add column if not exists image_url text;
alter table public.ads add column if not exists budget numeric default 0;
alter table public.ads add column if not exists created_at timestamptz default now();
alter table public.ads add column if not exists media_url text;

-- Storage bucket 'ads' for ad uploads (run in SQL Editor if bucket doesn't exist):
-- insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- values ('ads', 'ads', true, 52428800, array['video/mp4','video/webm','image/jpeg','image/png','image/webp'])
-- on conflict (id) do update set allowed_mime_types = excluded.allowed_mime_types;
