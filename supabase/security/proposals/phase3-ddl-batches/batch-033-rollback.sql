-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."garmon_ad_engagements" TO "anon";
GRANT REFERENCES ON TABLE public."garmon_ad_engagements" TO "anon";
GRANT TRIGGER ON TABLE public."garmon_ad_engagements" TO "anon";
GRANT TRUNCATE ON TABLE public."garmon_ad_engagements" TO "authenticated";
GRANT REFERENCES ON TABLE public."garmon_ad_engagements" TO "authenticated";
GRANT TRIGGER ON TABLE public."garmon_ad_engagements" TO "authenticated";
GRANT TRUNCATE ON TABLE public."garmon_ad_fraud_flags" TO "anon";
GRANT REFERENCES ON TABLE public."garmon_ad_fraud_flags" TO "anon";
GRANT TRIGGER ON TABLE public."garmon_ad_fraud_flags" TO "anon";
GRANT TRUNCATE ON TABLE public."garmon_ad_fraud_flags" TO "authenticated";
GRANT REFERENCES ON TABLE public."garmon_ad_fraud_flags" TO "authenticated";
GRANT TRIGGER ON TABLE public."garmon_ad_fraud_flags" TO "authenticated";
COMMIT;
