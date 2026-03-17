-- =============================================================
-- GARMONPAY ARENA — APPLY ALL MISSING MIGRATIONS
-- Run this entire file in Supabase SQL Editor
-- Safe to run multiple times (all statements use IF NOT EXISTS / ON CONFLICT DO NOTHING)
-- =============================================================


-- ============================================================
-- SECTION 1: Add missing columns to arena_fights
-- (tournament tracking + betting state)
-- ============================================================
ALTER TABLE public.arena_fights
  ADD COLUMN IF NOT EXISTS tournament_id UUID REFERENCES public.arena_tournaments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS round INT,
  ADD COLUMN IF NOT EXISTS betting_open BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.arena_fights.tournament_id IS 'Set when this fight is part of a tournament bracket';
COMMENT ON COLUMN public.arena_fights.round IS 'Tournament round number (0 = quarterfinals, 1 = semis, 2 = final)';
COMMENT ON COLUMN public.arena_fights.betting_open IS 'False after first exchange; spectators can only bet before this closes';

CREATE INDEX IF NOT EXISTS arena_fights_tournament_id ON public.arena_fights(tournament_id);


-- ============================================================
-- SECTION 2: Add missing columns to arena_spectator_bets
-- (payout tracking)
-- ============================================================
ALTER TABLE public.arena_spectator_bets
  ADD COLUMN IF NOT EXISTS payout_processed BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.arena_spectator_bets.payout_processed IS 'True after winning bets have been paid out';

CREATE INDEX IF NOT EXISTS arena_spectator_bets_payout ON public.arena_spectator_bets(payout_processed) WHERE payout_processed = FALSE;


-- ============================================================
-- SECTION 3: Add missing columns to arena_fighters
-- (visual customization + AI generation + 3D model)
-- ============================================================
ALTER TABLE public.arena_fighters
  ADD COLUMN IF NOT EXISTS body_type TEXT DEFAULT 'middleweight',
  ADD COLUMN IF NOT EXISTS skin_tone TEXT DEFAULT 'tone3',
  ADD COLUMN IF NOT EXISTS face_style TEXT DEFAULT 'determined',
  ADD COLUMN IF NOT EXISTS hair_style TEXT DEFAULT 'short_fade',
  ADD COLUMN IF NOT EXISTS nickname TEXT,
  ADD COLUMN IF NOT EXISTS origin TEXT,
  ADD COLUMN IF NOT EXISTS backstory TEXT,
  ADD COLUMN IF NOT EXISTS personality TEXT,
  ADD COLUMN IF NOT EXISTS trash_talk_style TEXT,
  ADD COLUMN IF NOT EXISTS signature_move_name TEXT,
  ADD COLUMN IF NOT EXISTS signature_move_desc TEXT,
  ADD COLUMN IF NOT EXISTS recommended_training TEXT,
  ADD COLUMN IF NOT EXISTS fighter_color TEXT DEFAULT '#f0a500',
  ADD COLUMN IF NOT EXISTS portrait_svg TEXT,
  ADD COLUMN IF NOT EXISTS generation_method TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS free_generation_used BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS model_3d_url TEXT,
  ADD COLUMN IF NOT EXISTS model_3d_status TEXT DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS model_3d_task_id TEXT,
  ADD COLUMN IF NOT EXISTS model_thumbnail_url TEXT,
  ADD COLUMN IF NOT EXISTS model_3d_generated_at TIMESTAMPTZ;


-- ============================================================
-- SECTION 4: Add missing column to users table
-- (free AI generation tracking)
-- ============================================================
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS arena_free_generation_used BOOLEAN DEFAULT FALSE;


-- ============================================================
-- SECTION 5: Add missing columns to arena_tournaments
-- (tournament type + coin entry fee)
-- ============================================================
ALTER TABLE public.arena_tournaments
  ADD COLUMN IF NOT EXISTS tournament_type TEXT DEFAULT 'weekly',
  ADD COLUMN IF NOT EXISTS entry_coin_fee INT DEFAULT 0;

-- Add check constraint safely
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'arena_tournaments_type_check'
  ) THEN
    ALTER TABLE public.arena_tournaments
      ADD CONSTRAINT arena_tournaments_type_check
      CHECK (tournament_type IN ('daily','weekly','monthly','vip'));
  END IF;
END $$;


-- ============================================================
-- SECTION 6: Add missing columns to arena_daily_login
-- ============================================================
ALTER TABLE public.arena_daily_login
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ DEFAULT NOW();


-- ============================================================
-- SECTION 7: Create missing tables
-- ============================================================

-- Daily spin tracking
CREATE TABLE IF NOT EXISTS public.arena_daily_spin (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  spin_date DATE NOT NULL,
  spins_used INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, spin_date)
);
CREATE INDEX IF NOT EXISTS arena_daily_spin_user_date ON public.arena_daily_spin(user_id, spin_date);

-- Referral bonus for arena coins
CREATE TABLE IF NOT EXISTS public.arena_referral_bonus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  coins_granted INT NOT NULL DEFAULT 500,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(referred_user_id)
);
CREATE INDEX IF NOT EXISTS arena_referral_bonus_referrer ON public.arena_referral_bonus(referrer_user_id);

-- Activity/anti-cheat log
CREATE TABLE IF NOT EXISTS public.arena_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ip TEXT,
  action_type TEXT NOT NULL,
  fingerprint_hash TEXT,
  reference_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS arena_activity_log_user_id ON public.arena_activity_log(user_id);
CREATE INDEX IF NOT EXISTS arena_activity_log_ip ON public.arena_activity_log(ip);
CREATE INDEX IF NOT EXISTS arena_activity_log_created_at ON public.arena_activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS arena_activity_log_action ON public.arena_activity_log(action_type);

-- 3D model generation queue
CREATE TABLE IF NOT EXISTS public.arena_model_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fighter_id UUID REFERENCES public.arena_fighters(id) ON DELETE CASCADE,
  task_id TEXT,
  status TEXT DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS arena_model_queue_fighter_id ON public.arena_model_queue(fighter_id);
CREATE INDEX IF NOT EXISTS arena_model_queue_status ON public.arena_model_queue(status);


-- ============================================================
-- SECTION 8: Fix arena_season_pass Stripe columns
-- ============================================================
ALTER TABLE public.arena_season_pass
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add unique constraint on stripe_subscription_id if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'arena_season_pass_stripe_subscription_id_key'
  ) THEN
    ALTER TABLE public.arena_season_pass ADD CONSTRAINT arena_season_pass_stripe_subscription_id_key UNIQUE (stripe_subscription_id);
  END IF;
END $$;

-- Widen status check to include Stripe lifecycle values
ALTER TABLE public.arena_season_pass DROP CONSTRAINT IF EXISTS arena_season_pass_status_check;
ALTER TABLE public.arena_season_pass ADD CONSTRAINT arena_season_pass_status_check
  CHECK (status IN ('active','canceled','cancelled','past_due'));


-- ============================================================
-- SECTION 9: Seed CPU system users (fixed style name)
-- ============================================================
INSERT INTO public.users (id, email, balance, role, is_super_admin, created_at)
VALUES
  ('a0000000-0000-0000-0000-000000000001', 'arena-cpu-1@garmonpay.internal', 0, 'user', false, now()),
  ('a0000000-0000-0000-0000-000000000002', 'arena-cpu-2@garmonpay.internal', 0, 'user', false, now()),
  ('a0000000-0000-0000-0000-000000000003', 'arena-cpu-3@garmonpay.internal', 0, 'user', false, now()),
  ('a0000000-0000-0000-0000-000000000004', 'arena-cpu-4@garmonpay.internal', 0, 'user', false, now()),
  ('a0000000-0000-0000-0000-000000000005', 'arena-cpu-5@garmonpay.internal', 0, 'user', false, now()),
  ('a0000000-0000-0000-0000-000000000006', 'arena-cpu-6@garmonpay.internal', 0, 'user', false, now())
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

-- CPU fighters (style name matches code: "Counterpuncher")
INSERT INTO public.arena_fighters (
  user_id, name, style, avatar,
  strength, speed, stamina, defense, chin, special
) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Brutus',  'Brawler',       '🥊', 65, 45, 50, 45, 60, 25),
  ('a0000000-0000-0000-0000-000000000002', 'Shadow',  'Boxer',         '🥊', 52, 62, 55, 58, 48, 28),
  ('a0000000-0000-0000-0000-000000000003', 'Tank',    'Slugger',        '🥊', 72, 38, 48, 42, 65, 30),
  ('a0000000-0000-0000-0000-000000000004', 'Slick',   'Counterpuncher','🥊', 48, 58, 52, 68, 50, 32),
  ('a0000000-0000-0000-0000-000000000005', 'Rush',    'Swarmer',       '🥊', 55, 68, 58, 44, 48, 26),
  ('a0000000-0000-0000-0000-000000000006', 'Ice',     'Technician',    '🥊', 50, 55, 54, 62, 52, 35)
ON CONFLICT (user_id) DO NOTHING;


-- ============================================================
-- SECTION 10: Seed store items
-- ============================================================
INSERT INTO public.arena_store_items
  (category, name, description, price, coin_price, stat_bonuses, effect_class, emoji, is_active)
VALUES
  ('Gloves',           'Basic Gloves',       '+2 Strength',                       4.99,  NULL,  '{"strength":2}',           NULL,            '🥊', true),
  ('Gloves',           'Pro Gloves',         '+5 Strength',                       9.99,  500,   '{"strength":5}',           NULL,            '🥊', true),
  ('Shoes',            'Speed Sneakers',     '+3 Speed',                          4.99,  NULL,  '{"speed":3}',              NULL,            '👟', true),
  ('Shoes',            'Elite Boots',        '+6 Speed',                         12.99,  650,   '{"speed":6}',              NULL,            '👟', true),
  ('Shorts',           'Training Shorts',    '+2 Stamina',                        3.99,  NULL,  '{"stamina":2}',            NULL,            '🩳', true),
  ('Shorts',           'Champion Shorts',    '+5 Stamina',                        8.99,  450,   '{"stamina":5}',            NULL,            '🩳', true),
  ('Headgear',         'Basic Headgear',     '+2 Defense',                        5.99,  NULL,  '{"defense":2}',            NULL,            '🪖', true),
  ('Headgear',         'Titan Helmet',       '+5 Defense, +2 Chin',              14.99,  700,   '{"defense":5,"chin":2}',   NULL,            '🪖', true),
  ('Special Upgrades', 'Combo Boost',        '+3 Special',                        6.99,  350,   '{"special":3}',            NULL,            '⚡', true),
  ('Special Upgrades', 'Finisher Pack',      '+8 Special',                       19.99, 1000,   '{"special":8}',            NULL,            '💥', true),
  ('Titles',           'Rookie',             'Title: Rookie',                     2.99,  200,   '{}',                       'title',         '🏅', true),
  ('Titles',           'Champion',           'Title: Champion',                   9.99,  800,   '{}',                       'title',         '🏆', true),
  ('Recovery',         'Full Recovery',      'Remove injured/tired status',       4.99,  250,   '{}',                       'recovery',      '💊', true),
  ('Training Camp',    'One-Fight Buff',     '+3 to one stat for next fight',    14.99,  NULL,  '{"temp_buff":3}',          'training_camp', '⛺', true),
  ('Arena Coins',      '100 Arena Coins',    'Arena store currency',              0.99,  NULL,  '{}',                       'coins',         '🪙', true),
  ('Arena Coins',      '500 Arena Coins',    'Arena store currency',              3.99,  NULL,  '{}',                       'coins',         '🪙', true),
  ('Arena Coins',      '1200 Arena Coins',   'Best value',                        7.99,  NULL,  '{}',                       'coins',         '🪙', true)
ON CONFLICT DO NOTHING;


-- ============================================================
-- SECTION 11: Seed jackpot initial row
-- ============================================================
INSERT INTO public.arena_jackpot (week_start, week_end, total_amount)
SELECT
  date_trunc('week', CURRENT_DATE)::date,
  date_trunc('week', CURRENT_DATE)::date + 7,
  500
WHERE NOT EXISTS (SELECT 1 FROM public.arena_jackpot LIMIT 1);


-- ============================================================
-- SECTION 12: Seed tournaments (one per type)
-- ============================================================
INSERT INTO public.arena_tournaments
  (name, tournament_type, entry_fee, entry_coin_fee, prize_pool, max_fighters, status)
VALUES
  ('Daily Free Roll', 'daily',   0,  100, 0, 8, 'open'),
  ('Weekly $5',       'weekly',  5,    0, 0, 8, 'open'),
  ('Monthly $20',     'monthly', 20,   0, 0, 8, 'open'),
  ('VIP $50',         'vip',     50,   0, 0, 8, 'open')
ON CONFLICT DO NOTHING;


-- ============================================================
-- SECTION 13: Seed arena achievements definitions
-- (stored in arena_achievements per fighter; keys defined here as reference)
-- These are the achievement definitions — add to a definitions table if you have one,
-- or leave as documentation. The arena_achievements table is per-fighter record.
-- ============================================================
-- No seeding needed for arena_achievements (it's per-fighter earned records)
-- But if you have an arena_achievement_definitions table, seed it here.


-- ============================================================
-- SECTION 14: Verify everything applied correctly
-- ============================================================
SELECT
  'arena_fights.tournament_id'        AS check_item, EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='arena_fights' AND column_name='tournament_id') AS ok
UNION ALL SELECT 'arena_fights.betting_open',         EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='arena_fights' AND column_name='betting_open')
UNION ALL SELECT 'arena_fights.round',                EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='arena_fights' AND column_name='round')
UNION ALL SELECT 'arena_spectator_bets.payout_processed', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='arena_spectator_bets' AND column_name='payout_processed')
UNION ALL SELECT 'arena_fighters.ai_generated',       EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='arena_fighters' AND column_name='ai_generated')
UNION ALL SELECT 'arena_fighters.model_3d_url',       EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='arena_fighters' AND column_name='model_3d_url')
UNION ALL SELECT 'arena_fighters.backstory',          EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='arena_fighters' AND column_name='backstory')
UNION ALL SELECT 'arena_tournaments.tournament_type', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='arena_tournaments' AND column_name='tournament_type')
UNION ALL SELECT 'arena_daily_spin table',            EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='arena_daily_spin')
UNION ALL SELECT 'arena_activity_log table',          EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='arena_activity_log')
UNION ALL SELECT 'arena_model_queue table',           EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='arena_model_queue')
UNION ALL SELECT 'cpu_fighters seeded',               EXISTS(SELECT 1 FROM public.arena_fighters WHERE user_id='a0000000-0000-0000-0000-000000000001')
UNION ALL SELECT 'store_items seeded',                EXISTS(SELECT 1 FROM public.arena_store_items LIMIT 1)
UNION ALL SELECT 'jackpot row exists',                EXISTS(SELECT 1 FROM public.arena_jackpot LIMIT 1)
UNION ALL SELECT 'tournaments seeded',                EXISTS(SELECT 1 FROM public.arena_tournaments LIMIT 1);
