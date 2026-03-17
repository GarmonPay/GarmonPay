-- =============================================================
-- GARMONPAY — CHECK DATABASE (read-only)
-- Run in Supabase SQL Editor to verify all required tables and columns exist.
-- Fix any missing items by running APPLY_MISSING_MIGRATIONS.sql, then re-run this check.
-- =============================================================

-- Step 1: List required tables and whether they exist
SELECT 'TABLE' AS check_type, table_name AS name,
  EXISTS (SELECT 1 FROM information_schema.tables t WHERE t.table_schema = 'public' AND t.table_name = v.table_name) AS exists_ok
FROM (VALUES
  ('arena_fighters'),
  ('arena_fights'),
  ('arena_spectator_bets'),
  ('arena_tournaments'),
  ('arena_tournament_entries'),
  ('arena_store_items'),
  ('arena_fighter_inventory'),
  ('arena_coin_transactions'),
  ('arena_admin_earnings'),
  ('arena_jackpot'),
  ('arena_achievements'),
  ('arena_season_pass'),
  ('arena_daily_login'),
  ('arena_daily_spin'),
  ('arena_referral_bonus'),
  ('arena_activity_log'),
  ('arena_model_queue'),
  ('arena_weight_classes')
) AS v(table_name)
ORDER BY 2;

-- Step 2: Required columns per table (only checks tables that exist)
-- arena_fights
SELECT 'COLUMN' AS check_type, 'arena_fights.' || col AS name,
  EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name = 'arena_fights' AND c.column_name = v.col) AS exists_ok
FROM (VALUES
  ('id'), ('fighter_a_id'), ('fighter_b_id'), ('winner_id'), ('fight_type'), ('betting_open'),
  ('tournament_id'), ('round'), ('fight_log'), ('created_at')
) AS v(col)
ORDER BY 2;

-- arena_fighters
SELECT 'COLUMN' AS check_type, 'arena_fighters.' || col AS name,
  EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name = 'arena_fighters' AND c.column_name = v.col) AS exists_ok
FROM (VALUES
  ('id'), ('user_id'), ('name'), ('style'), ('avatar'), ('strength'), ('speed'), ('stamina'), ('defense'), ('chin'), ('special'),
  ('wins'), ('losses'), ('win_streak'), ('equipped_gloves'), ('equipped_shoes'), ('equipped_shorts'), ('equipped_headgear'),
  ('body_type'), ('skin_tone'), ('face_style'), ('hair_style'),
  ('nickname'), ('portrait_svg'), ('generation_method'), ('model_3d_url'), ('model_3d_status'), ('model_thumbnail_url'),
  ('condition'), ('created_at'), ('updated_at')
) AS v(col)
ORDER BY 2;

-- arena_spectator_bets
SELECT 'COLUMN' AS check_type, 'arena_spectator_bets.' || col AS name,
  EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name = 'arena_spectator_bets' AND c.column_name = v.col) AS exists_ok
FROM (VALUES ('id'), ('user_id'), ('fight_id'), ('bet_on'), ('amount'), ('odds'), ('payout_processed'), ('created_at')) AS v(col)
ORDER BY 2;

-- arena_jackpot (must have week_start, week_end, total_amount — NOT amount/last_updated)
SELECT 'COLUMN' AS check_type, 'arena_jackpot.' || col AS name,
  EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name = 'arena_jackpot' AND c.column_name = v.col) AS exists_ok
FROM (VALUES ('id'), ('week_start'), ('week_end'), ('total_amount'), ('winner_fighter_id'), ('paid_out'), ('created_at')) AS v(col)
ORDER BY 2;

-- arena_season_pass
SELECT 'COLUMN' AS check_type, 'arena_season_pass.' || col AS name,
  EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name = 'arena_season_pass' AND c.column_name = v.col) AS exists_ok
FROM (VALUES ('id'), ('user_id'), ('stripe_subscription_id'), ('status'), ('current_period_end'), ('updated_at'), ('created_at')) AS v(col)
ORDER BY 2;

-- arena_tournaments
SELECT 'COLUMN' AS check_type, 'arena_tournaments.' || col AS name,
  EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name = 'arena_tournaments' AND c.column_name = v.col) AS exists_ok
FROM (VALUES ('id'), ('name'), ('tournament_type'), ('entry_fee'), ('entry_coin_fee'), ('prize_pool'), ('max_fighters'), ('status'), ('bracket'), ('created_at')) AS v(col)
ORDER BY 2;

-- users (arena columns)
SELECT 'COLUMN' AS check_type, 'users.' || col AS name,
  EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name = 'users' AND c.column_name = v.col) AS exists_ok
FROM (VALUES ('arena_coins'), ('arena_free_generation_used')) AS v(col)
ORDER BY 2;

-- Step 3: Summary — any missing?
SELECT
  (SELECT COUNT(*) FROM (VALUES
    ('arena_fighters'), ('arena_fights'), ('arena_spectator_bets'), ('arena_tournaments'), ('arena_tournament_entries'),
    ('arena_store_items'), ('arena_fighter_inventory'), ('arena_coin_transactions'), ('arena_admin_earnings'),
    ('arena_jackpot'), ('arena_achievements'), ('arena_season_pass'), ('arena_daily_login'), ('arena_daily_spin'),
    ('arena_referral_bonus'), ('arena_activity_log'), ('arena_model_queue')
  ) AS v(t) WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables x WHERE x.table_schema = 'public' AND x.table_name = v.t))
  AS missing_tables,
  (SELECT COUNT(*) FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name = 'arena_jackpot' AND c.column_name = 'amount')
  AS arena_jackpot_has_wrong_amount_column;

-- If missing_tables > 0 or arena_jackpot_has_wrong_amount_column = 1, run APPLY_MISSING_MIGRATIONS.sql (and fix jackpot insert if it used amount/last_updated).
