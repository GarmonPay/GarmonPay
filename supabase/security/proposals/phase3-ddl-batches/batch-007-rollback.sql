-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."arena_daily_login" TO "anon";
GRANT REFERENCES ON TABLE public."arena_daily_login" TO "anon";
GRANT TRIGGER ON TABLE public."arena_daily_login" TO "anon";
GRANT TRUNCATE ON TABLE public."arena_daily_login" TO "authenticated";
GRANT REFERENCES ON TABLE public."arena_daily_login" TO "authenticated";
GRANT TRIGGER ON TABLE public."arena_daily_login" TO "authenticated";
GRANT TRUNCATE ON TABLE public."arena_fighter_inventory" TO "anon";
GRANT REFERENCES ON TABLE public."arena_fighter_inventory" TO "anon";
GRANT TRIGGER ON TABLE public."arena_fighter_inventory" TO "anon";
GRANT TRUNCATE ON TABLE public."arena_fighter_inventory" TO "authenticated";
GRANT REFERENCES ON TABLE public."arena_fighter_inventory" TO "authenticated";
GRANT TRIGGER ON TABLE public."arena_fighter_inventory" TO "authenticated";
COMMIT;
