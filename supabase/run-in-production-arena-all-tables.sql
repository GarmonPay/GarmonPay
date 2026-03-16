-- Run this in Supabase Dashboard → SQL Editor to create ALL arena tables if they don't exist.
-- Safe to run multiple times (idempotent). Tables created (in order):
--
-- 1. public.users (column: arena_coins)
-- 2. arena_weight_classes
-- 3. arena_fighters
-- 4. arena_fights
-- 5. arena_spectator_bets
-- 6. arena_bets
-- 7. arena_tournaments
-- 8. arena_tournament_entries
-- 9. arena_challenges
-- 10. arena_transactions
-- 11. arena_admin_earnings
-- 12. arena_store_items
-- 13. arena_fighter_inventory
-- 14. arena_coins
-- 15. arena_coin_transactions
-- 16. arena_jackpot
-- 17. arena_achievements
-- 18. arena_season_pass
-- 19. arena_daily_login
-- 20. arena_spectators
-- 21. arena_trash_talk
-- 22. arena_highlights

-- Users: add arena_coins if not exists
alter table public.users add column if not exists arena_coins int not null default 0;

-- Weight classes (reference)
create table if not exists public.arena_weight_classes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  min_total_stats int not null,
  max_total_stats int not null,
  created_at timestamptz default now()
);
insert into public.arena_weight_classes (name, min_total_stats, max_total_stats) values
  ('Lightweight', 0, 319),
  ('Middleweight', 320, 420),
  ('Heavyweight', 421, 520),
  ('Unlimited', 521, 9999)
on conflict (name) do nothing;

-- Fighters (one per user)
create table if not exists public.arena_fighters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  style text not null,
  avatar text not null,
  title text,
  strength int not null default 48,
  speed int not null default 48,
  stamina int not null default 48,
  defense int not null default 48,
  chin int not null default 48,
  special int not null default 20,
  wins int not null default 0,
  losses int not null default 0,
  training_sessions int not null default 0,
  equipped_gloves uuid,
  equipped_shoes uuid,
  equipped_shorts uuid,
  equipped_headgear uuid,
  condition text not null default 'fresh' check (condition in ('fresh','tired','injured')),
  win_streak int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id)
);
create index if not exists arena_fighters_user_id on public.arena_fighters(user_id);
create index if not exists arena_fighters_condition on public.arena_fighters(condition);

-- Fights
create table if not exists public.arena_fights (
  id uuid primary key default gen_random_uuid(),
  fighter_a_id uuid not null references public.arena_fighters(id) on delete cascade,
  fighter_b_id uuid not null references public.arena_fighters(id) on delete cascade,
  winner_id uuid references public.arena_fighters(id) on delete set null,
  bet_a numeric not null default 0,
  bet_b numeric not null default 0,
  total_pot numeric not null default 0,
  admin_cut numeric not null default 0,
  jackpot_contrib numeric not null default 0,
  winner_payout numeric not null default 0,
  fight_log jsonb default '[]',
  fight_type text not null check (fight_type in ('cpu','pvp','ai','tournament','sparring')),
  created_at timestamptz default now()
);
create index if not exists arena_fights_created_at on public.arena_fights(created_at desc);
create index if not exists arena_fights_fighter_a on public.arena_fights(fighter_a_id);
create index if not exists arena_fights_fighter_b on public.arena_fights(fighter_b_id);

-- Spectator bets
create table if not exists public.arena_spectator_bets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  fight_id uuid not null references public.arena_fights(id) on delete cascade,
  amount numeric not null check (amount >= 1),
  bet_on uuid not null references public.arena_fighters(id) on delete cascade,
  odds numeric not null,
  result text,
  payout numeric,
  created_at timestamptz default now()
);
create index if not exists arena_spectator_bets_fight_id on public.arena_spectator_bets(fight_id);

-- Fighter bets (participant bets on own fight)
create table if not exists public.arena_bets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  fight_id uuid not null references public.arena_fights(id) on delete cascade,
  amount numeric not null check (amount >= 1),
  fighter_bet_on uuid not null references public.arena_fighters(id) on delete cascade,
  odds numeric not null,
  result text,
  payout numeric,
  created_at timestamptz default now()
);
create index if not exists arena_bets_fight_id on public.arena_bets(fight_id);

-- Tournaments
create table if not exists public.arena_tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  entry_fee numeric not null default 0,
  prize_pool numeric not null default 0,
  admin_cut numeric not null default 0,
  status text not null default 'open' check (status in ('open','in_progress','complete')),
  bracket jsonb default '{}',
  max_fighters int not null default 8,
  created_at timestamptz default now()
);

-- Tournament entries
create table if not exists public.arena_tournament_entries (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.arena_tournaments(id) on delete cascade,
  fighter_id uuid not null references public.arena_fighters(id) on delete cascade,
  seed int,
  created_at timestamptz default now(),
  unique(tournament_id, fighter_id)
);

-- Challenges
create table if not exists public.arena_challenges (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references public.arena_fighters(id) on delete cascade,
  challenged_id uuid not null references public.arena_fighters(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','completed')),
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

-- Arena transactions
create table if not exists public.arena_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null,
  amount numeric not null,
  status text not null default 'completed',
  description text,
  created_at timestamptz default now()
);

-- Admin earnings
create table if not exists public.arena_admin_earnings (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('fight','spectator','tournament','store','season_pass','coin_purchase','withdrawal_fee')),
  source_id uuid,
  amount numeric not null,
  created_at timestamptz default now()
);
create index if not exists arena_admin_earnings_source_type on public.arena_admin_earnings(source_type);
create index if not exists arena_admin_earnings_created_at on public.arena_admin_earnings(created_at desc);

-- Store items
create table if not exists public.arena_store_items (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  name text not null,
  description text,
  price numeric,
  coin_price int,
  stat_bonuses jsonb default '{}',
  effect_class text,
  emoji text,
  is_active boolean not null default true,
  created_at timestamptz default now()
);

-- Fighter inventory
create table if not exists public.arena_fighter_inventory (
  id uuid primary key default gen_random_uuid(),
  fighter_id uuid not null references public.arena_fighters(id) on delete cascade,
  store_item_id uuid not null references public.arena_store_items(id) on delete cascade,
  purchased_at timestamptz default now()
);

-- Arena coins (optional ledger)
create table if not exists public.arena_coins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade unique,
  balance int not null default 0,
  updated_at timestamptz default now()
);

-- Coin transaction log
create table if not exists public.arena_coin_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  amount int not null,
  type text not null,
  description text,
  created_at timestamptz default now()
);

-- Weekly jackpot
create table if not exists public.arena_jackpot (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  week_end date not null,
  total_amount numeric not null default 0,
  winner_fighter_id uuid references public.arena_fighters(id) on delete set null,
  paid_out boolean not null default false,
  created_at timestamptz default now()
);

-- Achievements
create table if not exists public.arena_achievements (
  id uuid primary key default gen_random_uuid(),
  fighter_id uuid not null references public.arena_fighters(id) on delete cascade,
  achievement_key text not null,
  unlocked_at timestamptz default now(),
  unique(fighter_id, achievement_key)
);

-- Season pass
create table if not exists public.arena_season_pass (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  stripe_subscription_id text,
  status text not null default 'active' check (status in ('active','cancelled')),
  started_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

-- Daily login
create table if not exists public.arena_daily_login (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  login_date date not null,
  day_streak int not null default 1,
  coins_earned int not null default 0,
  unique(user_id, login_date)
);

-- Spectators
create table if not exists public.arena_spectators (
  id uuid primary key default gen_random_uuid(),
  fight_id uuid not null references public.arena_fights(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  joined_at timestamptz default now()
);

-- Trash talk
create table if not exists public.arena_trash_talk (
  id uuid primary key default gen_random_uuid(),
  fight_id uuid not null references public.arena_fights(id) on delete cascade,
  fighter_id uuid not null references public.arena_fighters(id) on delete cascade,
  message text not null,
  created_at timestamptz default now()
);

-- Highlights
create table if not exists public.arena_highlights (
  id uuid primary key default gen_random_uuid(),
  fight_id uuid not null references public.arena_fights(id) on delete cascade,
  round int not null,
  exchange_num int not null,
  finishing_move text,
  created_at timestamptz default now()
);

-- Enable RLS (service role bypasses; app uses service role for arena APIs)
alter table public.arena_fighters enable row level security;
alter table public.arena_fights enable row level security;
alter table public.arena_spectator_bets enable row level security;
alter table public.arena_bets enable row level security;
alter table public.arena_tournaments enable row level security;
alter table public.arena_tournament_entries enable row level security;
alter table public.arena_challenges enable row level security;
alter table public.arena_transactions enable row level security;
alter table public.arena_admin_earnings enable row level security;
alter table public.arena_store_items enable row level security;
alter table public.arena_fighter_inventory enable row level security;
alter table public.arena_coins enable row level security;
alter table public.arena_coin_transactions enable row level security;
alter table public.arena_jackpot enable row level security;
alter table public.arena_achievements enable row level security;
alter table public.arena_season_pass enable row level security;
alter table public.arena_daily_login enable row level security;
alter table public.arena_spectators enable row level security;
alter table public.arena_trash_talk enable row level security;
alter table public.arena_highlights enable row level security;
