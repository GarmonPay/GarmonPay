-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."admin_logs" TO "anon";
GRANT REFERENCES ON TABLE public."admin_logs" TO "anon";
GRANT TRIGGER ON TABLE public."admin_logs" TO "anon";
GRANT TRUNCATE ON TABLE public."admin_logs" TO "authenticated";
GRANT REFERENCES ON TABLE public."admin_logs" TO "authenticated";
GRANT TRIGGER ON TABLE public."admin_logs" TO "authenticated";
GRANT TRUNCATE ON TABLE public."ads" TO "anon";
GRANT REFERENCES ON TABLE public."ads" TO "anon";
GRANT TRIGGER ON TABLE public."ads" TO "anon";
GRANT TRUNCATE ON TABLE public."ads" TO "authenticated";
GRANT REFERENCES ON TABLE public."ads" TO "authenticated";
GRANT TRIGGER ON TABLE public."ads" TO "authenticated";
COMMIT;
