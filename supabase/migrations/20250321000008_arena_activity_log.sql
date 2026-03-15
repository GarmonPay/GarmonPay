-- Arena anti-cheat: activity log for rate limit, velocity, and multi-account analysis.
create table if not exists public.arena_activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  ip text,
  action_type text not null,
  fingerprint_hash text,
  reference_id uuid,
  created_at timestamptz default now()
);
create index if not exists arena_activity_log_user_id on public.arena_activity_log(user_id);
create index if not exists arena_activity_log_ip on public.arena_activity_log(ip);
create index if not exists arena_activity_log_created_at on public.arena_activity_log(created_at desc);
create index if not exists arena_activity_log_action on public.arena_activity_log(action_type);
