-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."arena_fighters" TO "anon";
GRANT REFERENCES ON TABLE public."arena_fighters" TO "anon";
GRANT TRIGGER ON TABLE public."arena_fighters" TO "anon";
GRANT TRUNCATE ON TABLE public."arena_fighters" TO "authenticated";
GRANT REFERENCES ON TABLE public."arena_fighters" TO "authenticated";
GRANT TRIGGER ON TABLE public."arena_fighters" TO "authenticated";
GRANT TRUNCATE ON TABLE public."arena_fights" TO "anon";
GRANT REFERENCES ON TABLE public."arena_fights" TO "anon";
GRANT TRIGGER ON TABLE public."arena_fights" TO "anon";
GRANT TRUNCATE ON TABLE public."arena_fights" TO "authenticated";
GRANT REFERENCES ON TABLE public."arena_fights" TO "authenticated";
GRANT TRIGGER ON TABLE public."arena_fights" TO "authenticated";
COMMIT;
