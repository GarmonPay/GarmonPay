-- Emergency rollback only: restores inspected retired-game browser grants.
BEGIN;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON public.celo_pause_votes TO anon;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON public.celo_pause_votes TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON public.celo_chat TO anon;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON public.celo_chat TO authenticated;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON public.celo_audit_log TO anon;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON public.celo_audit_log TO authenticated;
GRANT SELECT,MAINTAIN ON public.celo_rooms TO anon;
GRANT SELECT,MAINTAIN ON public.celo_rooms TO authenticated;
GRANT SELECT,MAINTAIN ON public.celo_room_players TO anon;
GRANT SELECT,MAINTAIN ON public.celo_room_players TO authenticated;
GRANT SELECT,MAINTAIN ON public.celo_rounds TO anon;
GRANT SELECT,MAINTAIN ON public.celo_rounds TO authenticated;
GRANT SELECT,MAINTAIN ON public.celo_player_rolls TO anon;
GRANT SELECT,MAINTAIN ON public.celo_player_rolls TO authenticated;
GRANT SELECT,MAINTAIN ON public.celo_side_bets TO anon;
GRANT SELECT,MAINTAIN ON public.celo_side_bets TO authenticated;
COMMIT;
