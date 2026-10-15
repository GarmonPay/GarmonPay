-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."throttle_log" TO "anon";
GRANT REFERENCES ON TABLE public."throttle_log" TO "anon";
GRANT TRIGGER ON TABLE public."throttle_log" TO "anon";
GRANT TRUNCATE ON TABLE public."throttle_log" TO "authenticated";
GRANT REFERENCES ON TABLE public."throttle_log" TO "authenticated";
GRANT TRIGGER ON TABLE public."throttle_log" TO "authenticated";
GRANT TRUNCATE ON TABLE public."tournament_players" TO "anon";
GRANT REFERENCES ON TABLE public."tournament_players" TO "anon";
GRANT TRIGGER ON TABLE public."tournament_players" TO "anon";
GRANT TRUNCATE ON TABLE public."tournament_players" TO "authenticated";
GRANT REFERENCES ON TABLE public."tournament_players" TO "authenticated";
GRANT TRIGGER ON TABLE public."tournament_players" TO "authenticated";
COMMIT;
