-- Database-local recovery replaces the hosting plan's daily-only timeout cadence.
-- Run after 20261005010000. No HTTP calls, payment operations, dice generation or billing changes.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
REVOKE USAGE ON SCHEMA cron FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA cron FROM PUBLIC,anon,authenticated;
SELECT cron.schedule('garmonpay-celo-lifecycle-recovery','10 seconds','SELECT public.celo_recover_due_actions();');
COMMIT;
