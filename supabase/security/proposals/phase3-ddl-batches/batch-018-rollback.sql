-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."boxing_tournaments" TO "anon";
GRANT REFERENCES ON TABLE public."boxing_tournaments" TO "anon";
GRANT TRIGGER ON TABLE public."boxing_tournaments" TO "anon";
GRANT TRUNCATE ON TABLE public."boxing_tournaments" TO "authenticated";
GRANT REFERENCES ON TABLE public."boxing_tournaments" TO "authenticated";
GRANT TRIGGER ON TABLE public."boxing_tournaments" TO "authenticated";
GRANT TRUNCATE ON TABLE public."coin_flip_games" TO "anon";
GRANT REFERENCES ON TABLE public."coin_flip_games" TO "anon";
GRANT TRIGGER ON TABLE public."coin_flip_games" TO "anon";
GRANT TRUNCATE ON TABLE public."coin_flip_games" TO "authenticated";
GRANT REFERENCES ON TABLE public."coin_flip_games" TO "authenticated";
GRANT TRIGGER ON TABLE public."coin_flip_games" TO "authenticated";
COMMIT;
