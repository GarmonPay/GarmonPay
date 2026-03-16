-- Arena 3D model queue for Meshy task tracking (optional use).

CREATE TABLE IF NOT EXISTS public.arena_model_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fighter_id UUID REFERENCES public.arena_fighters(id) ON DELETE CASCADE,
  task_id TEXT,
  status TEXT DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS arena_model_queue_fighter_id ON public.arena_model_queue (fighter_id);
CREATE INDEX IF NOT EXISTS arena_model_queue_status ON public.arena_model_queue (status);

COMMENT ON TABLE public.arena_model_queue IS 'Optional queue for 3D model generation tasks';
