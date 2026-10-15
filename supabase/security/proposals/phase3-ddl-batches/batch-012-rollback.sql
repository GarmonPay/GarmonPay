-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."arena_tournament_entries" TO "anon";
GRANT REFERENCES ON TABLE public."arena_tournament_entries" TO "anon";
GRANT TRIGGER ON TABLE public."arena_tournament_entries" TO "anon";
GRANT TRUNCATE ON TABLE public."arena_tournament_entries" TO "authenticated";
GRANT REFERENCES ON TABLE public."arena_tournament_entries" TO "authenticated";
GRANT TRIGGER ON TABLE public."arena_tournament_entries" TO "authenticated";
GRANT TRUNCATE ON TABLE public."arena_tournaments" TO "anon";
GRANT REFERENCES ON TABLE public."arena_tournaments" TO "anon";
GRANT TRIGGER ON TABLE public."arena_tournaments" TO "anon";
GRANT TRUNCATE ON TABLE public."arena_tournaments" TO "authenticated";
GRANT REFERENCES ON TABLE public."arena_tournaments" TO "authenticated";
GRANT TRIGGER ON TABLE public."arena_tournaments" TO "authenticated";
COMMIT;
