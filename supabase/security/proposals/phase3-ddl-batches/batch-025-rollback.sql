-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."escape_room_timer_logs" TO "anon";
GRANT REFERENCES ON TABLE public."escape_room_timer_logs" TO "anon";
GRANT TRIGGER ON TABLE public."escape_room_timer_logs" TO "anon";
GRANT TRUNCATE ON TABLE public."escape_room_timer_logs" TO "authenticated";
GRANT REFERENCES ON TABLE public."escape_room_timer_logs" TO "authenticated";
GRANT TRIGGER ON TABLE public."escape_room_timer_logs" TO "authenticated";
GRANT TRUNCATE ON TABLE public."fight_bets" TO "anon";
GRANT REFERENCES ON TABLE public."fight_bets" TO "anon";
GRANT TRIGGER ON TABLE public."fight_bets" TO "anon";
GRANT TRUNCATE ON TABLE public."fight_bets" TO "authenticated";
GRANT REFERENCES ON TABLE public."fight_bets" TO "authenticated";
GRANT TRIGGER ON TABLE public."fight_bets" TO "authenticated";
COMMIT;
