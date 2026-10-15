-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."free_entries" TO "anon";
GRANT REFERENCES ON TABLE public."free_entries" TO "anon";
GRANT TRIGGER ON TABLE public."free_entries" TO "anon";
GRANT TRUNCATE ON TABLE public."free_entries" TO "authenticated";
GRANT REFERENCES ON TABLE public."free_entries" TO "authenticated";
GRANT TRIGGER ON TABLE public."free_entries" TO "authenticated";
GRANT TRUNCATE ON TABLE public."game_config" TO "anon";
GRANT REFERENCES ON TABLE public."game_config" TO "anon";
GRANT TRIGGER ON TABLE public."game_config" TO "anon";
GRANT TRUNCATE ON TABLE public."game_config" TO "authenticated";
GRANT REFERENCES ON TABLE public."game_config" TO "authenticated";
GRANT TRIGGER ON TABLE public."game_config" TO "authenticated";
COMMIT;
