-- Harden ad campaign submissions table with validation + indexes.
-- Safe to run after the base table has been created.

-- Helpful query performance indexes.
CREATE INDEX IF NOT EXISTS idx_ad_campaign_submissions_created_at
  ON public.ad_campaign_submissions (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ad_campaign_submissions_status
  ON public.ad_campaign_submissions (status);

-- Restrict status values to expected lifecycle states.
ALTER TABLE public.ad_campaign_submissions
  DROP CONSTRAINT IF EXISTS ad_campaign_submissions_status_check;

ALTER TABLE public.ad_campaign_submissions
  ADD CONSTRAINT ad_campaign_submissions_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'in_progress', 'completed'));

-- Require reasonably valid URLs for submitted content links.
ALTER TABLE public.ad_campaign_submissions
  DROP CONSTRAINT IF EXISTS ad_campaign_submissions_content_url_check;

ALTER TABLE public.ad_campaign_submissions
  ADD CONSTRAINT ad_campaign_submissions_content_url_check
  CHECK (content_url ~* '^https?://');

-- Keep campaign type values consistent with allowed UI options.
ALTER TABLE public.ad_campaign_submissions
  DROP CONSTRAINT IF EXISTS ad_campaign_submissions_campaign_type_check;

ALTER TABLE public.ad_campaign_submissions
  ADD CONSTRAINT ad_campaign_submissions_campaign_type_check
  CHECK (
    campaign_type IN (
      'YouTube Video Views',
      'YouTube Subscribers',
      'TikTok Video Views',
      'TikTok Followers',
      'TikTok Likes',
      'Instagram Reel Views',
      'Instagram Followers',
      'Instagram Likes',
      'Facebook Video Views',
      'Facebook Page Likes',
      'Facebook Followers',
      'GarmonPay General Ad'
    )
  );
