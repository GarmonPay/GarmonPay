-- Production auth security: lockout, IP tracking, security events.
-- Run: supabase db push (or apply via SQL Editor).

-- 1) User security columns (login lockout, IP, session)
alter table public.users add column if not exists failed_login_attempts int not null default 0;
alter table public.users add column if not exists locked_until timestamptz;
alter table public.users add column if not exists last_login_ip text;
alter table public.users add column if not exists last_login_at timestamptz;
alter table public.users add column if not exists registration_ip text;

comment on column public.users.failed_login_attempts is 'Count of consecutive failed logins; reset on success.';
comment on column public.users.locked_until is 'Account locked until this time (e.g. after 5 failed attempts).';
comment on column public.users.last_login_ip is 'IP of last successful login (for new-device email).';
comment on column public.users.last_login_at is 'Timestamp of last successful login.';
comment on column public.users.registration_ip is 'IP at signup (fraud detection).';

create index if not exists users_locked_until on public.users (locked_until) where locked_until is not null;
create index if not exists users_registration_ip on public.users (registration_ip);

-- 2) Security events (failed logins, lockouts, signups, logins) for admin dashboard
create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  email text,
  ip inet,
  ip_text text,
  event_type text not null,
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);

create index if not exists security_events_created_at on public.security_events (created_at desc);
create index if not exists security_events_event_type on public.security_events (event_type);
create index if not exists security_events_user_id on public.security_events (user_id);
create index if not exists security_events_ip_text on public.security_events (ip_text);

comment on table public.security_events is 'Audit log for auth: signup, login_success, login_failed, lockout, password_reset.';
comment on column public.security_events.event_type is 'One of: signup, login_success, login_failed, lockout, password_reset, mfa_enabled.';

alter table public.security_events enable row level security;

-- Only service role can read/write (admin API uses service role)
drop policy if exists "Service role full access security_events" on public.security_events;
create policy "Service role full access security_events"
  on public.security_events for all using (auth.jwt() ->> 'role' = 'service_role');
