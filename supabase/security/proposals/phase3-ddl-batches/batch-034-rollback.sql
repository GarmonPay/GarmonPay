-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."garmon_ad_streak" TO "anon";
GRANT REFERENCES ON TABLE public."garmon_ad_streak" TO "anon";
GRANT TRIGGER ON TABLE public."garmon_ad_streak" TO "anon";
GRANT TRUNCATE ON TABLE public."garmon_ad_streak" TO "authenticated";
GRANT REFERENCES ON TABLE public."garmon_ad_streak" TO "authenticated";
GRANT TRIGGER ON TABLE public."garmon_ad_streak" TO "authenticated";
GRANT TRUNCATE ON TABLE public."garmon_advertiser_social_links" TO "anon";
GRANT REFERENCES ON TABLE public."garmon_advertiser_social_links" TO "anon";
GRANT TRIGGER ON TABLE public."garmon_advertiser_social_links" TO "anon";
GRANT TRUNCATE ON TABLE public."garmon_advertiser_social_links" TO "authenticated";
GRANT REFERENCES ON TABLE public."garmon_advertiser_social_links" TO "authenticated";
GRANT TRIGGER ON TABLE public."garmon_advertiser_social_links" TO "authenticated";
COMMIT;
