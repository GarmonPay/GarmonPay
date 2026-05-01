-- Client submission signals for social task fraud (IP, UA, lightweight fingerprint)

ALTER TABLE public.social_task_completions
  ADD COLUMN IF NOT EXISTS submission_ip text,
  ADD COLUMN IF NOT EXISTS submission_ua text,
  ADD COLUMN IF NOT EXISTS submission_fingerprint text;

COMMENT ON COLUMN public.social_task_completions.submission_ip IS 'Client IP at submit (x-forwarded-for / x-real-ip)';
COMMENT ON COLUMN public.social_task_completions.submission_ua IS 'User-Agent header at submit';
COMMENT ON COLUMN public.social_task_completions.submission_fingerprint IS 'Optional client device signal hash for velocity / linking';

CREATE INDEX IF NOT EXISTS social_task_completions_submission_ip_completed_at_idx
  ON public.social_task_completions (submission_ip, completed_at DESC)
  WHERE submission_ip IS NOT NULL AND submission_ip <> '' AND submission_ip <> 'unknown';
