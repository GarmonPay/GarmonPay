-- Emergency rollback: restores inspected privacy exposures. No row changes.
BEGIN;
ALTER VIEW public.arena_cpu_fighters RESET (security_invoker);
ALTER VIEW public.admin_stats RESET (security_invoker);
ALTER VIEW public.total_deposits RESET (security_invoker);
ALTER VIEW public.admin_finance_overview RESET (security_invoker);
ALTER VIEW public.ad_campaign_submissions RESET (security_invoker);
CREATE POLICY "Authenticated can read users for leaderboard" ON public.users FOR SELECT TO authenticated USING (true);
CREATE POLICY "Celo lobby read banker profiles" ON public.users FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM celo_rooms r
  WHERE ((r.banker_id = users.id) AND (r.banker_id IS NOT NULL) AND ((r.room_type = 'public'::text) OR (r.room_type IS NULL)) AND (r.status = ANY (ARRAY['waiting'::text, 'active'::text, 'rolling'::text]))))));
ALTER POLICY "Service role full access analytics_events" ON public.analytics_events TO PUBLIC USING (true) WITH CHECK (true);
GRANT EXECUTE ON FUNCTION public.garmondrop_cancel_room(uuid) TO anon,authenticated;
COMMIT;
