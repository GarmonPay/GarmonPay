-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."garmon_blocked_ips" TO "anon";
GRANT REFERENCES ON TABLE public."garmon_blocked_ips" TO "anon";
GRANT TRIGGER ON TABLE public."garmon_blocked_ips" TO "anon";
GRANT TRUNCATE ON TABLE public."garmon_blocked_ips" TO "authenticated";
GRANT REFERENCES ON TABLE public."garmon_blocked_ips" TO "authenticated";
GRANT TRIGGER ON TABLE public."garmon_blocked_ips" TO "authenticated";
GRANT TRUNCATE ON TABLE public."garmon_notifications" TO "anon";
GRANT REFERENCES ON TABLE public."garmon_notifications" TO "anon";
GRANT TRIGGER ON TABLE public."garmon_notifications" TO "anon";
GRANT TRUNCATE ON TABLE public."garmon_notifications" TO "authenticated";
GRANT REFERENCES ON TABLE public."garmon_notifications" TO "authenticated";
GRANT TRIGGER ON TABLE public."garmon_notifications" TO "authenticated";
COMMIT;
