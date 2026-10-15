-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."arena_spectators" TO "anon";
GRANT REFERENCES ON TABLE public."arena_spectators" TO "anon";
GRANT TRIGGER ON TABLE public."arena_spectators" TO "anon";
GRANT TRUNCATE ON TABLE public."arena_spectators" TO "authenticated";
GRANT REFERENCES ON TABLE public."arena_spectators" TO "authenticated";
GRANT TRIGGER ON TABLE public."arena_spectators" TO "authenticated";
GRANT TRUNCATE ON TABLE public."arena_store_items" TO "anon";
GRANT REFERENCES ON TABLE public."arena_store_items" TO "anon";
GRANT TRIGGER ON TABLE public."arena_store_items" TO "anon";
GRANT TRUNCATE ON TABLE public."arena_store_items" TO "authenticated";
GRANT REFERENCES ON TABLE public."arena_store_items" TO "authenticated";
GRANT TRIGGER ON TABLE public."arena_store_items" TO "authenticated";
COMMIT;
