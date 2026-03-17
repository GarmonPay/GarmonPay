-- =============================================================
-- GARMONPAY — CHECK DATABASE (read-only, single result set)
-- Run in Supabase SQL Editor to verify all required tables/columns exist.
-- Missing items appear FIRST (exists_ok = false).
-- Fix any missing items by running APPLY_MISSING_MIGRATIONS.sql, then re-run.
-- =============================================================

SELECT check_type, name, exists_ok
FROM (

  -- ── TABLES / VIEWS ──────────────────────────────────────────────────────────
  SELECT
    'TABLE'        AS check_type,
    v.tname        AS name,
    EXISTS (
      SELECT 1 FROM information_schema.tables t
      WHERE t.table_schema = 'public' AND t.table_name = v.tname
    ) AS exists_ok
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
    ('arena_weight_classes'),
    ('arena_cpu_fighters'),   -- this is a VIEW, information_schema.tables includes views
    ('pinball_games'),
    ('pinball_jackpot'),
    ('pinball_leaderboard')
  ) AS v(tname)

  UNION ALL

  -- ── arena_fighters columns ───────────────────────────────────────────────────
  SELECT 'COLUMN', 'arena_fighters.' || v.cname,
    EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name   = 'arena_fighters'
        AND c.column_name  = v.cname
    )
  FROM (VALUES
    ('id'),             ('user_id'),           ('name'),
    ('style'),          ('avatar'),            ('title'),
    ('strength'),       ('speed'),             ('stamina'),
    ('defense'),        ('chin'),              ('special'),
    ('wins'),           ('losses'),            ('win_streak'),
    ('training_sessions'),
    ('equipped_gloves'),  ('equipped_shoes'),
    ('equipped_shorts'),  ('equipped_headgear'),
    ('body_type'),      ('skin_tone'),         ('face_style'),  ('hair_style'),
    -- AI / narrative columns (added in arena_ai_fighter_columns migration)
    ('fighter_color'),  ('nickname'),          ('backstory'),
    ('origin'),         ('personality'),       ('signature_move_name'),
    ('signature_move_desc'),
    -- Visual / generation columns
    ('portrait_svg'),   ('generation_method'),
    -- 3D model columns (added in arena_fighter_3d_meshy migration)
    ('model_3d_url'),   ('model_3d_status'),   ('model_3d_task_id'),
    ('model_thumbnail_url'), ('model_3d_generated_at'),
    -- Meta
    ('condition'),      ('created_at'),        ('updated_at')
  ) AS v(cname)

  UNION ALL

  -- ── arena_fights columns ─────────────────────────────────────────────────────
  -- NOTE: 'round' lives in arena_highlights, NOT arena_fights
  SELECT 'COLUMN', 'arena_fights.' || v.cname,
    EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name   = 'arena_fights'
        AND c.column_name  = v.cname
    )
  FROM (VALUES
    ('id'),           ('fighter_a_id'),  ('fighter_b_id'),
    ('winner_id'),    ('fight_type'),    ('betting_open'),
    ('tournament_id'),('fight_log'),     ('created_at')
  ) AS v(cname)

  UNION ALL

  -- ── arena_spectator_bets columns ─────────────────────────────────────────────
  -- NOTE: 'payout_processed' was never added; actual columns are 'result' and 'payout'
  SELECT 'COLUMN', 'arena_spectator_bets.' || v.cname,
    EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name   = 'arena_spectator_bets'
        AND c.column_name  = v.cname
    )
  FROM (VALUES
    ('id'), ('user_id'), ('fight_id'), ('bet_on'),
    ('amount'), ('odds'), ('result'), ('payout'), ('created_at')
  ) AS v(cname)

  UNION ALL

  -- ── arena_jackpot columns ────────────────────────────────────────────────────
  -- Correct schema: week_start / week_end / total_amount   (NOT amount / last_updated)
  SELECT 'COLUMN', 'arena_jackpot.' || v.cname,
    EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name   = 'arena_jackpot'
        AND c.column_name  = v.cname
    )
  FROM (VALUES
    ('id'), ('week_start'), ('week_end'), ('total_amount'),
    ('winner_fighter_id'), ('paid_out'), ('created_at')
  ) AS v(cname)

  UNION ALL

  -- ── arena_jackpot WRONG column (must NOT exist) ───────────────────────────────
  SELECT
    'WRONG_COL'                                             AS check_type,
    'arena_jackpot.amount  ← must NOT exist (schema uses total_amount)' AS name,
    NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name   = 'arena_jackpot'
        AND c.column_name  = 'amount'
    ) AS exists_ok   -- true = wrong col absent (good); false = wrong col present (run migration)

  UNION ALL

  -- ── arena_season_pass columns ────────────────────────────────────────────────
  SELECT 'COLUMN', 'arena_season_pass.' || v.cname,
    EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name   = 'arena_season_pass'
        AND c.column_name  = v.cname
    )
  FROM (VALUES
    ('id'), ('user_id'), ('stripe_subscription_id'), ('status'),
    ('current_period_end'), ('updated_at'), ('created_at')
  ) AS v(cname)

  UNION ALL

  -- ── arena_tournaments columns ────────────────────────────────────────────────
  SELECT 'COLUMN', 'arena_tournaments.' || v.cname,
    EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name   = 'arena_tournaments'
        AND c.column_name  = v.cname
    )
  FROM (VALUES
    ('id'), ('name'), ('tournament_type'), ('entry_fee'), ('entry_coin_fee'),
    ('prize_pool'), ('max_fighters'), ('status'), ('bracket'), ('created_at')
  ) AS v(cname)

  UNION ALL

  -- ── users — arena columns ─────────────────────────────────────────────────────
  SELECT 'COLUMN', 'users.' || v.cname,
    EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name   = 'users'
        AND c.column_name  = v.cname
    )
  FROM (VALUES
    ('arena_coins'), ('arena_free_generation_used')
  ) AS v(cname)

  UNION ALL

  -- ── pinball_games columns ─────────────────────────────────────────────────────
  SELECT 'COLUMN', 'pinball_games.' || v.cname,
    EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name   = 'pinball_games'
        AND c.column_name  = v.cname
    )
  FROM (VALUES
    ('id'), ('user_id'), ('mode'), ('score'), ('balls_used'),
    ('duration_seconds'), ('garmon_completions'), ('jackpot_hit'),
    ('coins_earned'), ('cash_earned_cents'), ('created_at')
  ) AS v(cname)

  UNION ALL

  -- ── pinball_jackpot columns ───────────────────────────────────────────────────
  SELECT 'COLUMN', 'pinball_jackpot.' || v.cname,
    EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name   = 'pinball_jackpot'
        AND c.column_name  = v.cname
    )
  FROM (VALUES
    ('id'), ('current_amount_cents'), ('last_won_at'),
    ('last_winner_id'), ('total_contributed_cents'), ('updated_at')
  ) AS v(cname)

  UNION ALL

  -- ── pinball_leaderboard columns ───────────────────────────────────────────────
  SELECT 'COLUMN', 'pinball_leaderboard.' || v.cname,
    EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name   = 'pinball_leaderboard'
        AND c.column_name  = v.cname
    )
  FROM (VALUES
    ('id'), ('user_id'), ('username'), ('highest_score'), ('total_score'),
    ('games_played'), ('level'), ('level_name'), ('wins'), ('losses'),
    ('total_earned_cents'), ('updated_at')
  ) AS v(cname)

) AS all_checks
ORDER BY
  exists_ok ASC,   -- false (missing/broken) first
  check_type,
  name;

-- ─── HOW TO READ THIS OUTPUT ──────────────────────────────────────────────────
-- exists_ok = true  → item exists and is correct
-- exists_ok = false → item is MISSING (TABLE/COLUMN) or WRONG (WRONG_COL)
-- If any rows show false → run APPLY_MISSING_MIGRATIONS.sql, then re-run this check.
-- WRONG_COL row for arena_jackpot.amount: false means the old 'amount' column is
--   still present and needs to be renamed/removed to total_amount.
