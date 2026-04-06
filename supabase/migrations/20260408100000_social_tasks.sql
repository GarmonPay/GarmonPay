-- Social proof / growth tasks and per-user completion tracking

CREATE TABLE IF NOT EXISTS public.social_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  platform text NOT NULL,
  task_type text NOT NULL,
  reward_cents integer NOT NULL,
  min_tier text NOT NULL DEFAULT 'free',
  proof_required boolean NOT NULL DEFAULT true,
  target_url text NOT NULL,
  max_completions integer NOT NULL DEFAULT 100,
  completions integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.social_task_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.social_tasks (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  proof_url text,
  status text NOT NULL DEFAULT 'pending',
  reward_cents integer NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, user_id)
);

CREATE INDEX IF NOT EXISTS social_task_completions_task_id_idx
  ON public.social_task_completions (task_id);

CREATE INDEX IF NOT EXISTS social_task_completions_user_id_idx
  ON public.social_task_completions (user_id);

CREATE INDEX IF NOT EXISTS social_task_completions_status_idx
  ON public.social_task_completions (status);

CREATE INDEX IF NOT EXISTS social_tasks_status_idx
  ON public.social_tasks (status);
