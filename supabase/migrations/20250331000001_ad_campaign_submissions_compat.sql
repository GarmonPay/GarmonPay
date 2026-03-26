-- Compatibility: some SQL or tools reference public.ad_campaign_submissions.
-- GarmonPay stores advertiser campaigns in public.garmon_ads (see 20250328000000_garmonpay_ad_system.sql).
-- This view exposes the same rows so SELECTs against ad_campaign_submissions work.
-- For INSERT/UPDATE/DELETE, use public.garmon_ads (or extend this migration with INSTEAD OF triggers if needed).
--
-- If this name already exists as a TABLE, CREATE VIEW / OR REPLACE VIEW fails with 42809.
-- DROP VIEW IF EXISTS errors when the object is a table; DROP TABLE IF EXISTS errors when it is a view.
-- Drop by relkind so either case works.

DO $dropper$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'ad_campaign_submissions' AND c.relkind = 'r'
  ) THEN
    EXECUTE 'DROP TABLE public.ad_campaign_submissions CASCADE';
  ELSIF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'ad_campaign_submissions' AND c.relkind = 'm'
  ) THEN
    EXECUTE 'DROP MATERIALIZED VIEW public.ad_campaign_submissions CASCADE';
  ELSIF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'ad_campaign_submissions' AND c.relkind = 'v'
  ) THEN
    EXECUTE 'DROP VIEW public.ad_campaign_submissions CASCADE';
  END IF;
END
$dropper$;

CREATE VIEW public.ad_campaign_submissions AS
SELECT * FROM public.garmon_ads;

COMMENT ON VIEW public.ad_campaign_submissions IS
  'Alias over garmon_ads for legacy queries; source of truth is public.garmon_ads.';
