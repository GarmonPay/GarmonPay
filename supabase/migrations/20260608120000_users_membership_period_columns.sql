-- public.users: columns introduced in 20260505170000_rewire_membership_pay_with_balance.sql
-- If that migration was skipped, purchase_membership_with_balance_v2 and app updates fail.
-- Idempotent; safe to re-run.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS membership_started_at timestamptz;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS membership_period_end timestamptz;
