-- Base table for advertiser campaign intake from public /advertise page.
-- This must run before hardening constraints/indexes migration.

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
