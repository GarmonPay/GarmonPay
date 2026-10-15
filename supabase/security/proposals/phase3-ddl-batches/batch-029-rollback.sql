-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."game_rewards" TO "anon";
GRANT REFERENCES ON TABLE public."game_rewards" TO "anon";
GRANT TRIGGER ON TABLE public."game_rewards" TO "anon";
GRANT TRUNCATE ON TABLE public."game_rewards" TO "authenticated";
GRANT REFERENCES ON TABLE public."game_rewards" TO "authenticated";
GRANT TRIGGER ON TABLE public."game_rewards" TO "authenticated";
GRANT TRUNCATE ON TABLE public."game_station_scores" TO "anon";
GRANT REFERENCES ON TABLE public."game_station_scores" TO "anon";
GRANT TRIGGER ON TABLE public."game_station_scores" TO "anon";
GRANT TRUNCATE ON TABLE public."game_station_scores" TO "authenticated";
GRANT REFERENCES ON TABLE public."game_station_scores" TO "authenticated";
GRANT TRIGGER ON TABLE public."game_station_scores" TO "authenticated";
COMMIT;
