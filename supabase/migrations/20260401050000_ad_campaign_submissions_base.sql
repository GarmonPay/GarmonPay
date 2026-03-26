-- Base table for advertiser campaign intake from public /advertise page.
-- This must run before hardening constraints/indexes migration.

-- Safety: if a view/materialized view/foreign table exists with this name,
-- remove it so CREATE TABLE can succeed.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'ad_campaign_submissions'
      AND c.relkind = 'v'
  ) THEN
    EXECUTE 'DROP VIEW public.ad_campaign_submissions';
  ELSIF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'ad_campaign_submissions'
      AND c.relkind = 'm'
  ) THEN
    EXECUTE 'DROP MATERIALIZED VIEW public.ad_campaign_submissions';
  ELSIF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'ad_campaign_submissions'
      AND c.relkind = 'f'
  ) THEN
    EXECUTE 'DROP FOREIGN TABLE public.ad_campaign_submissions';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.ad_campaign_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_type text NOT NULL,
  content_url text NOT NULL,
  campaign_goal text NOT NULL,
  target_audience text NOT NULL,
  package_selected text NOT NULL,
  contact_email text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
