-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."advertisements" TO "anon";
GRANT REFERENCES ON TABLE public."advertisements" TO "anon";
GRANT TRIGGER ON TABLE public."advertisements" TO "anon";
GRANT TRUNCATE ON TABLE public."advertisements" TO "authenticated";
GRANT REFERENCES ON TABLE public."advertisements" TO "authenticated";
GRANT TRIGGER ON TABLE public."advertisements" TO "authenticated";
GRANT TRUNCATE ON TABLE public."analytics_events" TO "anon";
GRANT REFERENCES ON TABLE public."analytics_events" TO "anon";
GRANT TRIGGER ON TABLE public."analytics_events" TO "anon";
GRANT TRUNCATE ON TABLE public."analytics_events" TO "authenticated";
GRANT REFERENCES ON TABLE public."analytics_events" TO "authenticated";
GRANT TRIGGER ON TABLE public."analytics_events" TO "authenticated";
COMMIT;
