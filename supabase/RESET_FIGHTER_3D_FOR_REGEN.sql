-- Reset all fighters so 3D models regenerate with the new Meshy preview→refine pipeline.
-- Run in Supabase SQL Editor after deploying the app.

UPDATE public.arena_fighters
SET
  model_3d_status = 'not_started',
  model_3d_url = NULL,
  model_3d_task_id = NULL,
  model_3d_preview_task_id = NULL,
  model_thumbnail_url = NULL,
  model_3d_generated_at = NULL,
  updated_at = NOW();

-- Optional: limit to specific users or fighters, e.g.:
-- WHERE user_id = '...';
