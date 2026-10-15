-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."badges" TO "anon";
GRANT REFERENCES ON TABLE public."badges" TO "anon";
GRANT TRIGGER ON TABLE public."badges" TO "anon";
GRANT TRUNCATE ON TABLE public."badges" TO "authenticated";
GRANT REFERENCES ON TABLE public."badges" TO "authenticated";
GRANT TRIGGER ON TABLE public."badges" TO "authenticated";
GRANT TRUNCATE ON TABLE public."balance_audit_log" TO "anon";
GRANT REFERENCES ON TABLE public."balance_audit_log" TO "anon";
GRANT TRIGGER ON TABLE public."balance_audit_log" TO "anon";
GRANT TRUNCATE ON TABLE public."balance_audit_log" TO "authenticated";
GRANT REFERENCES ON TABLE public."balance_audit_log" TO "authenticated";
GRANT TRIGGER ON TABLE public."balance_audit_log" TO "authenticated";
COMMIT;
