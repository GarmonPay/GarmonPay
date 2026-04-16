-- Social task rewards: store GPay Coins (GPC), not USD cents.
-- Existing integers remain valid ($0.50 → 50 GPC at 100 GPC = $1).

ALTER TABLE public.social_tasks RENAME COLUMN reward_cents TO reward_gpc;
ALTER TABLE public.social_task_completions RENAME COLUMN reward_cents TO reward_gpc;

COMMENT ON COLUMN public.social_tasks.reward_gpc IS 'Reward in GPay Coins (GPC); 100 GPC = $1.00';
COMMENT ON COLUMN public.social_task_completions.reward_gpc IS 'Snapshot of task reward_gpc at submission';
