-- BLOCKED ORIGINAL PROPOSAL — historical test fixture only. Do not apply in production.
-- Superseded by four narrower applied migrations and an approval-only unused-DDL proposal.
-- No row changes. Preserve service access and public catalog reads.
BEGIN;
SET LOCAL lock_timeout = '5s';
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
-- Table revocation does not remove explicit column grants; retain only reviewed display fields.
DO $$ DECLARE col record; BEGIN
 FOR col IN SELECT c.relname,a.attname FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p','v') AND a.attnum>0 AND NOT a.attisdropped AND a.attacl IS NOT NULL LOOP
  EXECUTE format('REVOKE INSERT (%I), UPDATE (%I), REFERENCES (%I) ON public.%I FROM PUBLIC,anon,authenticated',col.attname,col.attname,col.attname,col.relname);
 END LOOP;
END $$;
GRANT UPDATE (full_name,avatar_url) ON public.users TO authenticated;
DROP POLICY "Authenticated can read users for leaderboard" ON public.users;
DROP POLICY "Celo lobby read banker profiles" ON public.users;
ALTER POLICY "Service role full access analytics_events" ON public.analytics_events TO service_role USING (true) WITH CHECK (true);
REVOKE SELECT ON public.analytics_events,public.fight_escrow,public.fight_bets,public.garmon_ads FROM PUBLIC,anon,authenticated;
ALTER VIEW public.arena_cpu_fighters SET (security_invoker = true);
ALTER VIEW public.admin_stats SET (security_invoker = true);
ALTER VIEW public.total_deposits SET (security_invoker = true);
ALTER VIEW public.admin_finance_overview SET (security_invoker = true);
ALTER VIEW public.ad_campaign_submissions SET (security_invoker = true);
ALTER FUNCTION public.coin_flip_pvp_only_guard() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.garmon_date_utc(timestamp with time zone) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.update_referral_count() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.create_wallet_for_new_user() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.handle_stripe_deposit(uuid,numeric) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.escape_room_set_updated_at() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.update_daily_profit_summary() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.check_platform_balance_integrity() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.garmon_margin_last_24h() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.garmondrop_empty_board() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.garmondrop_cell(jsonb,integer,integer) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.garmondrop_count_dir(jsonb,integer,integer,integer,integer,integer) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.garmondrop_has_winner(jsonb,integer,integer,integer) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.garmondrop_board_full(jsonb) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.add_deposit(uuid,numeric) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.add_game_reward(uuid,numeric) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.debit_gpay_coins(uuid,integer) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.increment_wallet(uuid,integer) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.request_withdrawal(uuid,numeric) SET search_path = pg_catalog, public, pg_temp;
REVOKE EXECUTE ON FUNCTION public.update_referral_count() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.create_wallet_for_new_user() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.record_user_joined() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.celo_bump_room_total_rounds() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_users_balance_from_wallet() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_profile() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.on_ad_session_start_record_click() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_balance_on_transaction() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_wallets_from_wallet_balances() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.garmondrop_cancel_room(uuid) FROM PUBLIC,anon,authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon,authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon,authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
COMMIT;
