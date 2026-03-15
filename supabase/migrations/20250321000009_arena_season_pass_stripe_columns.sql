-- Ensure arena_season_pass has Stripe columns (whether table was created by base schema or 000006).
alter table public.arena_season_pass add column if not exists stripe_subscription_id text unique;
alter table public.arena_season_pass add column if not exists current_period_end timestamptz;
alter table public.arena_season_pass add column if not exists updated_at timestamptz default now();
-- Allow statuses used by Stripe subscription lifecycle
alter table public.arena_season_pass drop constraint if exists arena_season_pass_status_check;
alter table public.arena_season_pass add constraint arena_season_pass_status_check
  check (status in ('active','canceled','cancelled','past_due'));
