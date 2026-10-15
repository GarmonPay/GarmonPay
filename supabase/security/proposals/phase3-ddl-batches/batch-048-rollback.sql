-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."profit" TO "anon";
GRANT REFERENCES ON TABLE public."profit" TO "anon";
GRANT TRIGGER ON TABLE public."profit" TO "anon";
GRANT TRUNCATE ON TABLE public."profit" TO "authenticated";
GRANT REFERENCES ON TABLE public."profit" TO "authenticated";
GRANT TRIGGER ON TABLE public."profit" TO "authenticated";
GRANT TRUNCATE ON TABLE public."rank_config" TO "anon";
GRANT REFERENCES ON TABLE public."rank_config" TO "anon";
GRANT TRIGGER ON TABLE public."rank_config" TO "anon";
GRANT TRUNCATE ON TABLE public."rank_config" TO "authenticated";
GRANT REFERENCES ON TABLE public."rank_config" TO "authenticated";
GRANT TRIGGER ON TABLE public."rank_config" TO "authenticated";
COMMIT;
