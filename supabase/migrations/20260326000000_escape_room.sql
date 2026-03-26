-- Stake & Escape game schema
-- Server-authoritative sessions, puzzle rotation, payouts, anti-cheat, and admin controls.

create extension if not exists pgcrypto;

alter table public.users
  add column if not exists kyc_verified boolean not null default false;

alter table public.users
  drop constraint if exists users_role_check;

alter table public.users
  add constraint users_role_check
  check (role in ('member', 'admin', 'game_admin', 'super_admin', 'user'));

create table if not exists public.escape_room_settings (
  id bigint generated always as identity primary key,
  free_play_enabled boolean not null default true,
  stake_mode_enabled boolean not null default true,
  min_stake_cents bigint not null default 100,
  max_stake_cents bigint not null default 10000,
  platform_fee_percent numeric(5,2) not null default 15.00,
  top1_split_percent numeric(5,2) not null default 50.00,
  top2_split_percent numeric(5,2) not null default 30.00,
  top3_split_percent numeric(5,2) not null default 20.00,
  countdown_seconds integer not null default 600,
  daily_puzzle_rotation_enabled boolean not null default true,
  maintenance_banner text,
  suspicious_min_escape_seconds integer not null default 45,
  large_payout_alert_cents bigint not null default 100000,
  email_alert_large_payout boolean not null default true,
  email_alert_suspicious boolean not null default true,
  email_alert_wallet_errors boolean not null default true,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.escape_room_puzzles (
  id uuid primary key default gen_random_uuid(),
  puzzle_name text not null,
  clue_transaction_id text not null,
  clue_formula text not null,
  clue_terminal_text text,
  clue_cabinet_text text,
  correct_pin text not null check (char_length(correct_pin) = 4),
  difficulty_level text not null default 'medium' check (difficulty_level in ('easy', 'medium', 'hard', 'expert')),
  active_date date not null,
  is_active boolean not null default true,
  preview_text text,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists escape_room_puzzles_active_date_idx
  on public.escape_room_puzzles (active_date desc, is_active);

create table if not exists public.escape_room_player_status (
  player_id uuid primary key references public.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'suspended', 'banned')),
  reason text,
  flagged_suspicious boolean not null default false,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.escape_room_sessions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.users(id) on delete cascade,
  mode text not null check (mode in ('free', 'stake')),
  stake_cents bigint not null default 0,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  countdown_seconds integer not null,
  server_elapsed_seconds integer,
  escape_time_seconds integer,
  result text not null default 'active' check (result in ('active', 'win', 'lose', 'timeout', 'voided')),
  timer_valid boolean,
  puzzle_id uuid references public.escape_room_puzzles(id) on delete set null,
  puzzle_progress jsonb not null default '{}'::jsonb,
  entered_pin text,
  prize_pool_window text not null,
  platform_fee_cents bigint not null default 0,
  projected_payout_cents bigint not null default 0,
  payout_cents bigint not null default 0,
  payout_status text not null default 'none' check (payout_status in ('none', 'pending', 'paid', 'rejected', 'voided', 'failed')),
  payout_reference text,
  suspicious boolean not null default false,
  suspicious_reason text,
  ip_address text,
  device_fingerprint text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists escape_room_sessions_player_idx
  on public.escape_room_sessions (player_id, started_at desc);
create index if not exists escape_room_sessions_window_idx
  on public.escape_room_sessions (prize_pool_window, mode, result);
create index if not exists escape_room_sessions_active_idx
  on public.escape_room_sessions (result, started_at desc) where result = 'active';
create index if not exists escape_room_sessions_suspicious_idx
  on public.escape_room_sessions (suspicious, started_at desc) where suspicious = true;

create table if not exists public.escape_room_flags (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.escape_room_sessions(id) on delete cascade,
  player_id uuid not null references public.users(id) on delete cascade,
  reason text not null,
  flag_type text not null default 'suspicious_time',
  status text not null default 'pending' check (status in ('pending', 'legit', 'cheated', 'voided')),
  notes text,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists escape_room_flags_status_idx
  on public.escape_room_flags (status, created_at desc);

create table if not exists public.escape_room_timer_logs (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.escape_room_sessions(id) on delete cascade,
  event_type text not null check (event_type in ('start', 'finish', 'sync', 'void', 'payout')),
  server_time timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create index if not exists escape_room_timer_logs_session_idx
  on public.escape_room_timer_logs (session_id, server_time desc);

create table if not exists public.escape_room_payouts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.escape_room_sessions(id) on delete cascade,
  player_id uuid not null references public.users(id) on delete cascade,
  amount_cents bigint not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'paid', 'failed', 'voided')),
  error_message text,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists escape_room_payouts_status_idx
  on public.escape_room_payouts (status, created_at desc);

create or replace function public.escape_room_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_escape_room_settings_updated_at on public.escape_room_settings;
create trigger trg_escape_room_settings_updated_at
  before update on public.escape_room_settings
  for each row execute function public.escape_room_set_updated_at();

drop trigger if exists trg_escape_room_puzzles_updated_at on public.escape_room_puzzles;
create trigger trg_escape_room_puzzles_updated_at
  before update on public.escape_room_puzzles
  for each row execute function public.escape_room_set_updated_at();

drop trigger if exists trg_escape_room_player_status_updated_at on public.escape_room_player_status;
create trigger trg_escape_room_player_status_updated_at
  before update on public.escape_room_player_status
  for each row execute function public.escape_room_set_updated_at();

drop trigger if exists trg_escape_room_sessions_updated_at on public.escape_room_sessions;
create trigger trg_escape_room_sessions_updated_at
  before update on public.escape_room_sessions
  for each row execute function public.escape_room_set_updated_at();

drop trigger if exists trg_escape_room_flags_updated_at on public.escape_room_flags;
create trigger trg_escape_room_flags_updated_at
  before update on public.escape_room_flags
  for each row execute function public.escape_room_set_updated_at();

drop trigger if exists trg_escape_room_payouts_updated_at on public.escape_room_payouts;
create trigger trg_escape_room_payouts_updated_at
  before update on public.escape_room_payouts
  for each row execute function public.escape_room_set_updated_at();

insert into public.escape_room_settings (free_play_enabled, stake_mode_enabled)
select true, true
where not exists (select 1 from public.escape_room_settings);

insert into public.escape_room_puzzles (
  puzzle_name,
  clue_transaction_id,
  clue_formula,
  clue_terminal_text,
  clue_cabinet_text,
  correct_pin,
  difficulty_level,
  active_date,
  is_active,
  preview_text
)
select
  'Vault Rotation Alpha',
  'TXN-GP-4831',
  'PIN = (last two digits of TXN) + cabinet offset 34',
  'Terminal log: settlement ID TXN-GP-4831. Extract the last two digits.',
  'Cabinet note: add offset 34 to terminal suffix. Keep result as four digits.',
  '0065',
  'medium',
  current_date,
  true,
  'Terminal transaction suffix + filing cabinet offset'
where not exists (select 1 from public.escape_room_puzzles where active_date = current_date and is_active = true);

alter table public.escape_room_settings enable row level security;
alter table public.escape_room_puzzles enable row level security;
alter table public.escape_room_player_status enable row level security;
alter table public.escape_room_sessions enable row level security;
alter table public.escape_room_flags enable row level security;
alter table public.escape_room_timer_logs enable row level security;
alter table public.escape_room_payouts enable row level security;

drop policy if exists "Service role escape_room_settings" on public.escape_room_settings;
create policy "Service role escape_room_settings"
  on public.escape_room_settings for all
  using (auth.jwt() ->> 'role' = 'service_role')
  with check (auth.jwt() ->> 'role' = 'service_role');

drop policy if exists "Service role escape_room_puzzles" on public.escape_room_puzzles;
create policy "Service role escape_room_puzzles"
  on public.escape_room_puzzles for all
  using (auth.jwt() ->> 'role' = 'service_role')
  with check (auth.jwt() ->> 'role' = 'service_role');

drop policy if exists "Service role escape_room_player_status" on public.escape_room_player_status;
create policy "Service role escape_room_player_status"
  on public.escape_room_player_status for all
  using (auth.jwt() ->> 'role' = 'service_role')
  with check (auth.jwt() ->> 'role' = 'service_role');

drop policy if exists "Service role escape_room_sessions" on public.escape_room_sessions;
create policy "Service role escape_room_sessions"
  on public.escape_room_sessions for all
  using (auth.jwt() ->> 'role' = 'service_role')
  with check (auth.jwt() ->> 'role' = 'service_role');

drop policy if exists "Service role escape_room_flags" on public.escape_room_flags;
create policy "Service role escape_room_flags"
  on public.escape_room_flags for all
  using (auth.jwt() ->> 'role' = 'service_role')
  with check (auth.jwt() ->> 'role' = 'service_role');

drop policy if exists "Service role escape_room_timer_logs" on public.escape_room_timer_logs;
create policy "Service role escape_room_timer_logs"
  on public.escape_room_timer_logs for all
  using (auth.jwt() ->> 'role' = 'service_role')
  with check (auth.jwt() ->> 'role' = 'service_role');

drop policy if exists "Service role escape_room_payouts" on public.escape_room_payouts;
create policy "Service role escape_room_payouts"
  on public.escape_room_payouts for all
  using (auth.jwt() ->> 'role' = 'service_role')
  with check (auth.jwt() ->> 'role' = 'service_role');
