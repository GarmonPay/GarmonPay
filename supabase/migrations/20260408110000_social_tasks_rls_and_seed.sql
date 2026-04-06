-- RLS + policies + seed data for social tasks (idempotent where possible)

ALTER TABLE public.social_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_task_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read active tasks" ON public.social_tasks;
CREATE POLICY "Anyone can read active tasks"
  ON public.social_tasks FOR SELECT
  TO authenticated
  USING (status = 'active');

DROP POLICY IF EXISTS "Users submit completions" ON public.social_task_completions;
CREATE POLICY "Users submit completions"
  ON public.social_task_completions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read own completions" ON public.social_task_completions;
CREATE POLICY "Users read own completions"
  ON public.social_task_completions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Seed tasks (skip if already present by title)
INSERT INTO public.social_tasks (
  title, description, platform, task_type,
  reward_cents, min_tier, target_url, max_completions
)
SELECT 'Follow GarmonPay on Instagram', 'Follow our official Instagram', 'instagram', 'follow',
       50, 'free', 'https://instagram.com/garmonpay', 500
WHERE NOT EXISTS (SELECT 1 FROM public.social_tasks WHERE title = 'Follow GarmonPay on Instagram');

INSERT INTO public.social_tasks (
  title, description, platform, task_type,
  reward_cents, min_tier, target_url, max_completions
)
SELECT 'Like our latest TikTok', 'Like our pinned TikTok video', 'tiktok', 'like',
       25, 'free', 'https://tiktok.com/@garmonpay', 500
WHERE NOT EXISTS (SELECT 1 FROM public.social_tasks WHERE title = 'Like our latest TikTok');

INSERT INTO public.social_tasks (
  title, description, platform, task_type,
  reward_cents, min_tier, target_url, max_completions
)
SELECT 'Subscribe to YouTube', 'Subscribe to GarmonPay YouTube', 'youtube', 'subscribe',
       75, 'free', 'https://youtube.com/@garmonpay', 500
WHERE NOT EXISTS (SELECT 1 FROM public.social_tasks WHERE title = 'Subscribe to YouTube');

INSERT INTO public.social_tasks (
  title, description, platform, task_type,
  reward_cents, min_tier, target_url, max_completions
)
SELECT 'Follow on Twitter/X', 'Follow GarmonPay on Twitter', 'twitter', 'follow',
       35, 'free', 'https://twitter.com/garmonpay', 500
WHERE NOT EXISTS (SELECT 1 FROM public.social_tasks WHERE title = 'Follow on Twitter/X');

INSERT INTO public.social_tasks (
  title, description, platform, task_type,
  reward_cents, min_tier, target_url, max_completions
)
SELECT 'Comment on Instagram', 'Leave a comment on our latest post', 'instagram', 'comment',
       100, 'starter', 'https://instagram.com/garmonpay', 200
WHERE NOT EXISTS (SELECT 1 FROM public.social_tasks WHERE title = 'Comment on Instagram');

INSERT INTO public.social_tasks (
  title, description, platform, task_type,
  reward_cents, min_tier, target_url, max_completions
)
SELECT 'Share our TikTok', 'Share our latest video to your story', 'tiktok', 'share',
       150, 'starter', 'https://tiktok.com/@garmonpay', 200
WHERE NOT EXISTS (SELECT 1 FROM public.social_tasks WHERE title = 'Share our TikTok');
