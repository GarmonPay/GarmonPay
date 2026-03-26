-- Compatibility: some SQL or tools reference public.ad_campaign_submissions.
-- GarmonPay stores advertiser campaigns in public.garmon_ads (see 20250328000000_garmonpay_ad_system.sql).
-- This view exposes the same rows so SELECTs against ad_campaign_submissions work.
-- For INSERT/UPDATE/DELETE, use public.garmon_ads (or extend this migration with INSTEAD OF triggers if needed).
--
-- If this name already exists as a TABLE (common after failed runs), CREATE OR REPLACE VIEW fails with 42809.
-- Drop either kind, then create the view.

DROP VIEW IF EXISTS public.ad_campaign_submissions;
DROP TABLE IF EXISTS public.ad_campaign_submissions CASCADE;

CREATE VIEW public.ad_campaign_submissions AS
SELECT * FROM public.garmon_ads;

COMMENT ON VIEW public.ad_campaign_submissions IS
  'Alias over garmon_ads for legacy queries; source of truth is public.garmon_ads.';
