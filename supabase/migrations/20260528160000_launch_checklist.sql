-- Pre-launch readiness checklist for admin.

CREATE TABLE IF NOT EXISTS public.launch_checklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_key text NOT NULL UNIQUE,
  label text NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  completed_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.launch_checklist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS launch_checklist_admin_all ON public.launch_checklist;
CREATE POLICY launch_checklist_admin_all
  ON public.launch_checklist FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND lower(COALESCE(u.role, '')) IN ('admin', 'game_admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND lower(COALESCE(u.role, '')) IN ('admin', 'game_admin', 'super_admin')
    )
  );

INSERT INTO public.launch_checklist (item_key, label, sort_order) VALUES
  ('debug_celo_disabled', 'NEXT_PUBLIC_DEBUG_CELO disabled in Vercel', 10),
  ('stripe_price_ids', 'Stripe price IDs set in Vercel env (STARTER, GROWTH, PRO, ELITE)', 20),
  ('migration_drift', 'Supabase migration drift repaired', 30),
  ('watch_timer_tested', '30-second watch timer exploit-tested', 40),
  ('watch_payout_set', 'Watch GPC payout rate set', 50),
  ('test_video_approved', 'At least one approved test video in /admin/videos', 60),
  ('waitlist_resend', 'Waitlist email confirmation (Resend) configured', 70),
  ('dns_verified', 'Domain DNS records verified', 80),
  ('capture_mobile', 'Capture page mobile-tested', 90),
  ('admin_mfa', 'Admin login MFA enabled (if available)', 100)
ON CONFLICT (item_key) DO NOTHING;
