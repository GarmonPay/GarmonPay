-- Silent verification: trust scores, flags, optional user ban (internal only)

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS social_banned boolean NOT NULL DEFAULT false;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS social_strike_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.social_task_completions
  ADD COLUMN IF NOT EXISTS trust_score integer,
  ADD COLUMN IF NOT EXISTS flagged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flag_reason text,
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending_review',
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

CREATE TABLE IF NOT EXISTS public.social_fraud_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.social_tasks (id) ON DELETE SET NULL,
  completion_id uuid REFERENCES public.social_task_completions (id) ON DELETE CASCADE,
  reason text,
  severity text NOT NULL DEFAULT 'low' CHECK (severity IN ('low', 'medium', 'high')),
  auto_detected boolean NOT NULL DEFAULT true,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS social_fraud_flags_user_id_idx ON public.social_fraud_flags (user_id);
CREATE INDEX IF NOT EXISTS social_fraud_flags_completion_id_idx ON public.social_fraud_flags (completion_id);

CREATE OR REPLACE FUNCTION public.increment_social_strikes(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.users
  SET social_strike_count = social_strike_count + 1
  WHERE id = p_user_id;
END;
$$;
