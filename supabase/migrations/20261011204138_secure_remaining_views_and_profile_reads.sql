-- Five invoker views, owner-only user reads, and a corrected service-only analytics policy.
-- No row changes; approved public catalogs continue using their existing tables/server APIs.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER VIEW public.arena_cpu_fighters SET (security_invoker = true);
ALTER VIEW public.admin_stats SET (security_invoker = true);
ALTER VIEW public.total_deposits SET (security_invoker = true);
ALTER VIEW public.admin_finance_overview SET (security_invoker = true);
ALTER VIEW public.ad_campaign_submissions SET (security_invoker = true);
DROP POLICY "Authenticated can read users for leaderboard" ON public.users;
DROP POLICY "Celo lobby read banker profiles" ON public.users;
ALTER POLICY "Service role full access analytics_events" ON public.analytics_events TO service_role USING (true) WITH CHECK (true);
REVOKE EXECUTE ON FUNCTION public.garmondrop_cancel_room(uuid) FROM PUBLIC,anon,authenticated;
COMMIT;
