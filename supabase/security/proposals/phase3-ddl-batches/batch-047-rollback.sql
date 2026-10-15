-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."platform_revenue" TO "anon";
GRANT REFERENCES ON TABLE public."platform_revenue" TO "anon";
GRANT TRIGGER ON TABLE public."platform_revenue" TO "anon";
GRANT TRUNCATE ON TABLE public."platform_revenue" TO "authenticated";
GRANT REFERENCES ON TABLE public."platform_revenue" TO "authenticated";
GRANT TRIGGER ON TABLE public."platform_revenue" TO "authenticated";
GRANT TRUNCATE ON TABLE public."platform_settings" TO "anon";
GRANT REFERENCES ON TABLE public."platform_settings" TO "anon";
GRANT TRIGGER ON TABLE public."platform_settings" TO "anon";
GRANT TRUNCATE ON TABLE public."platform_settings" TO "authenticated";
GRANT REFERENCES ON TABLE public."platform_settings" TO "authenticated";
GRANT TRIGGER ON TABLE public."platform_settings" TO "authenticated";
COMMIT;
