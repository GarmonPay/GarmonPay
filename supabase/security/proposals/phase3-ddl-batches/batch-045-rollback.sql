-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."pinball_sessions" TO "anon";
GRANT REFERENCES ON TABLE public."pinball_sessions" TO "anon";
GRANT TRIGGER ON TABLE public."pinball_sessions" TO "anon";
GRANT TRUNCATE ON TABLE public."pinball_sessions" TO "authenticated";
GRANT REFERENCES ON TABLE public."pinball_sessions" TO "authenticated";
GRANT TRIGGER ON TABLE public."pinball_sessions" TO "authenticated";
GRANT TRUNCATE ON TABLE public."platform_activities" TO "anon";
GRANT REFERENCES ON TABLE public."platform_activities" TO "anon";
GRANT TRIGGER ON TABLE public."platform_activities" TO "anon";
GRANT TRUNCATE ON TABLE public."platform_activities" TO "authenticated";
GRANT REFERENCES ON TABLE public."platform_activities" TO "authenticated";
GRANT TRIGGER ON TABLE public."platform_activities" TO "authenticated";
COMMIT;
