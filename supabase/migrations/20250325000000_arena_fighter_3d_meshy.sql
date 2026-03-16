-- Arena fighter 3D model (Meshy) columns.

ALTER TABLE public.arena_fighters
  ADD COLUMN IF NOT EXISTS model_3d_url TEXT,
  ADD COLUMN IF NOT EXISTS model_3d_status TEXT DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS model_3d_task_id TEXT,
  ADD COLUMN IF NOT EXISTS model_thumbnail_url TEXT,
  ADD COLUMN IF NOT EXISTS model_3d_generated_at TIMESTAMPTZ;

COMMENT ON COLUMN public.arena_fighters.model_3d_url IS 'Meshy GLB model URL when generation complete';
COMMENT ON COLUMN public.arena_fighters.model_3d_status IS 'not_started | generating | complete | failed';
COMMENT ON COLUMN public.arena_fighters.model_3d_task_id IS 'Meshy task ID for polling';
COMMENT ON COLUMN public.arena_fighters.model_thumbnail_url IS 'Meshy thumbnail image URL';
COMMENT ON COLUMN public.arena_fighters.model_3d_generated_at IS 'When 3D model was completed';
