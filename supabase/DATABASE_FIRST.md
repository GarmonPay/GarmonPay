# Database-first: Check, then apply, then code & UI

Follow this order so the database matches what the code expects.

## Step 1 — Check database first

Run **`CHECK_DATABASE.sql`** in Supabase Dashboard → SQL Editor.

- It lists required **tables** and whether they exist.
- It lists required **columns** for key tables (`arena_fights`, `arena_fighters`, `arena_spectator_bets`, `arena_jackpot`, `arena_season_pass`, `arena_tournaments`, `users`).
- Summary at the end: `missing_tables` should be `0`; `arena_jackpot_has_wrong_amount_column` should be `0` (jackpot uses `total_amount`, not `amount`).

If any check fails, go to Step 2.

## Step 2 — Make sure all tables exist

Run **`APPLY_MISSING_MIGRATIONS.sql`** in Supabase SQL Editor.

- Creates missing tables: `arena_daily_spin`, `arena_referral_bonus`, `arena_activity_log`, `arena_model_queue`, etc.
- Adds missing columns to `arena_fights`, `arena_spectator_bets`, `arena_fighters`, `arena_tournaments`, `arena_season_pass`, `arena_daily_login`, `users`.
- Seeds CPU users, CPU fighters, store items, one jackpot row (current week, `total_amount`), and tournaments.

Safe to run multiple times. Then re-run **`CHECK_DATABASE.sql`** to confirm.

## Step 3 — Make sure all columns exist

`APPLY_MISSING_MIGRATIONS.sql` already adds all columns from the migration set. If you added a new migration file, add the same `ADD COLUMN IF NOT EXISTS` (or `CREATE TABLE IF NOT EXISTS`) to the appropriate section of `APPLY_MISSING_MIGRATIONS.sql` so one script keeps production in sync.

Key column names the code expects:

- **arena_jackpot:** `week_start`, `week_end`, `total_amount` (not `amount` or `last_updated`).
- **arena_spectator_bets:** `bet_on` (not `bet_on_fighter_id`).
- **arena_fights:** no `ended_at`; use `winner_id` + `betting_open: false` to mark finished.
- **arena_season_pass:** `current_period_end`, `stripe_subscription_id`, `status`, `updated_at`.
- **users:** `arena_coins`, `arena_free_generation_used`.

## Step 4 — Then fix the code

API and server code must use the column names above. If you see errors like "column X does not exist", fix the code to use the correct column (and ensure Step 2 has been run so the column exists).

## Step 5 — Then fix the UI

UI should read the same field names the API returns (e.g. `totalAmount` from jackpot, `bet_on` / `betOn` from spectator bets). If the API was fixed to match the database, update the UI to match the API response shape.
