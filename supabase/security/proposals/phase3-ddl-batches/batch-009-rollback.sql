-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."arena_highlights" TO "anon";
GRANT REFERENCES ON TABLE public."arena_highlights" TO "anon";
GRANT TRIGGER ON TABLE public."arena_highlights" TO "anon";
GRANT TRUNCATE ON TABLE public."arena_highlights" TO "authenticated";
GRANT REFERENCES ON TABLE public."arena_highlights" TO "authenticated";
GRANT TRIGGER ON TABLE public."arena_highlights" TO "authenticated";
GRANT TRUNCATE ON TABLE public."arena_jackpot" TO "anon";
GRANT REFERENCES ON TABLE public."arena_jackpot" TO "anon";
GRANT TRIGGER ON TABLE public."arena_jackpot" TO "anon";
GRANT TRUNCATE ON TABLE public."arena_jackpot" TO "authenticated";
GRANT REFERENCES ON TABLE public."arena_jackpot" TO "authenticated";
GRANT TRIGGER ON TABLE public."arena_jackpot" TO "authenticated";
COMMIT;
