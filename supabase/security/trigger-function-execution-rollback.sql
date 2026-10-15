-- Emergency rollback of inspected trigger function grants only.
BEGIN;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_user_joined() TO PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.celo_bump_room_total_rounds() TO PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_auth_user() TO PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_users_balance_from_wallet() TO PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_profile() TO PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.on_ad_session_start_record_click() TO PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_balance_on_transaction() TO PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_wallets_from_wallet_balances() TO PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_referral_count() TO PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_wallet_for_new_user() TO PUBLIC,anon,authenticated;
COMMIT;
