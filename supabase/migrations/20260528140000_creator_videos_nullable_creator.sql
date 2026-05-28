-- Allow platform-uploaded videos without a creator attribution.

ALTER TABLE public.creator_videos
  ALTER COLUMN creator_id DROP NOT NULL;

COMMENT ON COLUMN public.creator_videos.creator_id IS
  'Creator who uploaded the video; NULL for admin platform uploads.';
