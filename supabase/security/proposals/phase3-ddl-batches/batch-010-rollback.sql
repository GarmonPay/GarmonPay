-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."arena_season_pass" TO "anon";
GRANT REFERENCES ON TABLE public."arena_season_pass" TO "anon";
GRANT TRIGGER ON TABLE public."arena_season_pass" TO "anon";
GRANT TRUNCATE ON TABLE public."arena_season_pass" TO "authenticated";
GRANT REFERENCES ON TABLE public."arena_season_pass" TO "authenticated";
GRANT TRIGGER ON TABLE public."arena_season_pass" TO "authenticated";
GRANT TRUNCATE ON TABLE public."arena_spectator_bets" TO "anon";
GRANT REFERENCES ON TABLE public."arena_spectator_bets" TO "anon";
GRANT TRIGGER ON TABLE public."arena_spectator_bets" TO "anon";
GRANT TRUNCATE ON TABLE public."arena_spectator_bets" TO "authenticated";
GRANT REFERENCES ON TABLE public."arena_spectator_bets" TO "authenticated";
GRANT TRIGGER ON TABLE public."arena_spectator_bets" TO "authenticated";
COMMIT;
