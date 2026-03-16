-- Run this in Supabase SQL Editor for Meshy 3D + Arena model queue.
-- Arena fighter 3D columns (if not already applied via migration):

ALTER TABLE arena_fighters
  ADD COLUMN IF NOT EXISTS model_3d_url TEXT,
  ADD COLUMN IF NOT EXISTS model_3d_status TEXT DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS model_3d_task_id TEXT,
  ADD COLUMN IF NOT EXISTS model_thumbnail_url TEXT,
  ADD COLUMN IF NOT EXISTS model_3d_generated_at TIMESTAMPTZ;

-- Arena model queue table:

CREATE TABLE IF NOT EXISTS arena_model_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  fighter_id UUID REFERENCES arena_fighters(id) ON DELETE CASCADE,
  task_id TEXT,
  status TEXT DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS arena_model_queue_fighter_id ON arena_model_queue (fighter_id);
CREATE INDEX IF NOT EXISTS arena_model_queue_status ON arena_model_queue (status);
