-- Track Meshy preview task id so clients polling with stale preview id still resolve the fighter row.
ALTER TABLE public.arena_fighters
  ADD COLUMN IF NOT EXISTS model_3d_preview_task_id TEXT;

COMMENT ON COLUMN public.arena_fighters.model_3d_preview_task_id IS 'Meshy preview task id; kept after handoff to refine for lookup';
