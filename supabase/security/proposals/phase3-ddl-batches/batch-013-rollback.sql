-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."arena_transactions" TO "anon";
GRANT REFERENCES ON TABLE public."arena_transactions" TO "anon";
GRANT TRIGGER ON TABLE public."arena_transactions" TO "anon";
GRANT TRUNCATE ON TABLE public."arena_transactions" TO "authenticated";
GRANT REFERENCES ON TABLE public."arena_transactions" TO "authenticated";
GRANT TRIGGER ON TABLE public."arena_transactions" TO "authenticated";
GRANT TRUNCATE ON TABLE public."arena_trash_talk" TO "anon";
GRANT REFERENCES ON TABLE public."arena_trash_talk" TO "anon";
GRANT TRIGGER ON TABLE public."arena_trash_talk" TO "anon";
GRANT TRUNCATE ON TABLE public."arena_trash_talk" TO "authenticated";
GRANT REFERENCES ON TABLE public."arena_trash_talk" TO "authenticated";
GRANT TRIGGER ON TABLE public."arena_trash_talk" TO "authenticated";
COMMIT;
