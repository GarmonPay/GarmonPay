-- Internal trigger functions are not public RPCs. Existing trigger firing is preserved.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.record_user_joined() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.celo_bump_room_total_rounds() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_users_balance_from_wallet() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_profile() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.on_ad_session_start_record_click() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_balance_on_transaction() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_wallets_from_wallet_balances() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.update_referral_count() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.create_wallet_for_new_user() FROM PUBLIC,anon,authenticated;
COMMIT;
