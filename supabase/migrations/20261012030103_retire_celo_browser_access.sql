-- Complete C-Lo retirement at the database API boundary; audit rows and server grants preserved.
BEGIN;
REVOKE ALL ON public.celo_pause_votes FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.celo_chat FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.celo_audit_log FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.celo_action_receipts FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.celo_rooms FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.celo_room_players FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.celo_rounds FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.celo_player_rolls FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.celo_side_bets FROM PUBLIC,anon,authenticated;
COMMIT;
