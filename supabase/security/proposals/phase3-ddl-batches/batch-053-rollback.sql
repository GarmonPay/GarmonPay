-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."reward_spend_log" TO "anon";
GRANT REFERENCES ON TABLE public."reward_spend_log" TO "anon";
GRANT TRIGGER ON TABLE public."reward_spend_log" TO "anon";
GRANT TRUNCATE ON TABLE public."reward_spend_log" TO "authenticated";
GRANT REFERENCES ON TABLE public."reward_spend_log" TO "authenticated";
GRANT TRIGGER ON TABLE public."reward_spend_log" TO "authenticated";
GRANT TRUNCATE ON TABLE public."security_events" TO "anon";
GRANT REFERENCES ON TABLE public."security_events" TO "anon";
GRANT TRIGGER ON TABLE public."security_events" TO "anon";
GRANT TRUNCATE ON TABLE public."security_events" TO "authenticated";
GRANT REFERENCES ON TABLE public."security_events" TO "authenticated";
GRANT TRIGGER ON TABLE public."security_events" TO "authenticated";
COMMIT;
