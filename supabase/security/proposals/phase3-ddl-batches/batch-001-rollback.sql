-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."ad_clicks" TO "anon";
GRANT REFERENCES ON TABLE public."ad_clicks" TO "anon";
GRANT TRIGGER ON TABLE public."ad_clicks" TO "anon";
GRANT TRUNCATE ON TABLE public."ad_clicks" TO "authenticated";
GRANT REFERENCES ON TABLE public."ad_clicks" TO "authenticated";
GRANT TRIGGER ON TABLE public."ad_clicks" TO "authenticated";
GRANT TRUNCATE ON TABLE public."ad_packages" TO "anon";
GRANT REFERENCES ON TABLE public."ad_packages" TO "anon";
GRANT TRIGGER ON TABLE public."ad_packages" TO "anon";
GRANT TRUNCATE ON TABLE public."ad_packages" TO "authenticated";
GRANT REFERENCES ON TABLE public."ad_packages" TO "authenticated";
GRANT TRIGGER ON TABLE public."ad_packages" TO "authenticated";
COMMIT;
