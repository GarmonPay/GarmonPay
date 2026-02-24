-- GarmonPay: ad_clicks table for click tracking; ensure all money-system tables exist and are connected.
-- Clicks are recorded when a user starts an ad session (or can be recorded separately via API).

-- ad_clicks: one row per click (e.g. per session start or explicit click)
create table if not exists public.ad_clicks (
  id uuid primary key default gen_random_uuid(),
  ad_id uuid not null references public.ads (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists ad_clicks_ad_id on public.ad_clicks (ad_id);
create index if not exists ad_clicks_user_id on public.ad_clicks (user_id);
create index if not exists ad_clicks_created_at on public.ad_clicks (created_at desc);

alter table public.ad_clicks enable row level security;
create policy "Users can read own ad_clicks"
  on public.ad_clicks for select using (auth.uid() = user_id);
create policy "Service role full access ad_clicks"
  on public.ad_clicks for all using (auth.jwt() ->> 'role' = 'service_role');

-- Record a click when an ad session is started (trigger)
create or replace function public.on_ad_session_start_record_click()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.ad_clicks (ad_id, user_id) values (new.ad_id, new.user_id);
  return new;
end;
$$;
drop trigger if exists after_ad_session_insert_click on public.ad_sessions;
create trigger after_ad_session_insert_click
  after insert on public.ad_sessions
  for each row execute procedure public.on_ad_session_start_record_click();
