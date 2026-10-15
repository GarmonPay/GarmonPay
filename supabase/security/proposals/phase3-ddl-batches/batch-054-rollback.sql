-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."security_logs" TO "anon";
GRANT REFERENCES ON TABLE public."security_logs" TO "anon";
GRANT TRIGGER ON TABLE public."security_logs" TO "anon";
GRANT TRUNCATE ON TABLE public."security_logs" TO "authenticated";
GRANT REFERENCES ON TABLE public."security_logs" TO "authenticated";
GRANT TRIGGER ON TABLE public."security_logs" TO "authenticated";
GRANT TRUNCATE ON TABLE public."settings" TO "anon";
GRANT REFERENCES ON TABLE public."settings" TO "anon";
GRANT TRIGGER ON TABLE public."settings" TO "anon";
GRANT TRUNCATE ON TABLE public."settings" TO "authenticated";
GRANT REFERENCES ON TABLE public."settings" TO "authenticated";
GRANT TRIGGER ON TABLE public."settings" TO "authenticated";
COMMIT;
