-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."arena_achievements" TO "anon";
GRANT REFERENCES ON TABLE public."arena_achievements" TO "anon";
GRANT TRIGGER ON TABLE public."arena_achievements" TO "anon";
GRANT TRUNCATE ON TABLE public."arena_achievements" TO "authenticated";
GRANT REFERENCES ON TABLE public."arena_achievements" TO "authenticated";
GRANT TRIGGER ON TABLE public."arena_achievements" TO "authenticated";
GRANT TRUNCATE ON TABLE public."arena_admin_earnings" TO "anon";
GRANT REFERENCES ON TABLE public."arena_admin_earnings" TO "anon";
GRANT TRIGGER ON TABLE public."arena_admin_earnings" TO "anon";
GRANT TRUNCATE ON TABLE public."arena_admin_earnings" TO "authenticated";
GRANT REFERENCES ON TABLE public."arena_admin_earnings" TO "authenticated";
GRANT TRIGGER ON TABLE public."arena_admin_earnings" TO "authenticated";
COMMIT;
