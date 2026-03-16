# Arena migrations (production)

**Quick fix for "Failed to create fighter" only:** run the single file in Supabase Dashboard → SQL Editor:
- **`run-in-production-arena-fighters.sql`** — creates `arena_fighters` and dependencies. Safe to run multiple times.

**Full arena schema:** Apply these in order if production has not run them yet. Easiest: from repo root run:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

Or in **Supabase Dashboard → SQL Editor**, run each file’s contents in this order:

1. `20250321000000_arena_schema.sql` — base arena tables (`arena_fighters`, `arena_fights`, etc.)
2. `20250321000001_arena_cpu_fighters.sql`
3. `20250321000002_arena_spectator_betting.sql`
4. `20250321000003_arena_store_seed.sql`
5. `20250321000004_arena_tournaments_type.sql`
6. `20250321000005_arena_tournaments_seed.sql`
7. `20250321000006_arena_season_pass.sql`
8. `20250321000007_arena_daily_engagement.sql`
9. `20250321000008_arena_activity_log.sql`
10. `20250321000009_arena_season_pass_stripe_columns.sql`
11. `20250322000000_arena_fighter_visual_columns.sql` — body_type, skin_tone, face_style, hair_style (visual builder)

If `arena_fighters` is missing, the create-fighter API will fail with a DB error; applying step 1 fixes that.
