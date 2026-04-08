-- Gamification config: single-row config for game costs and house edge.
-- Replaces previous gamification_config if present (different schema).

DROP TABLE IF EXISTS public.gamification_config;

CREATE TABLE public.gamification_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  spin_cost numeric NOT NULL DEFAULT 1,
  scratch_cost numeric NOT NULL DEFAULT 1,
  mystery_box_cost numeric NOT NULL DEFAULT 2,
  boxing_cost numeric NOT NULL DEFAULT 1,
  pinball_cost numeric NOT NULL DEFAULT 1,
  house_edge numeric NOT NULL DEFAULT 0.10,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Seed one default row so admin always has a config.
INSERT INTO public.gamification_config (
  spin_cost,
  scratch_cost,
  mystery_box_cost,
  boxing_cost,
  pinball_cost,
  house_edge
) VALUES (1, 1, 2, 1, 1, 0.10);

-- RLS: allow service role full access for admin endpoints.
ALTER TABLE public.gamification_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access gamification_config" ON public.gamification_config;
CREATE POLICY "Service role full access gamification_config"
  ON public.gamification_config
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.gamification_config IS 'Admin-configurable costs and house edge for gamification (spin, scratch, mystery box, boxing, pinball).';
