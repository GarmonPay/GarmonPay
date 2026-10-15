-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."garmon_user_ad_earnings" TO "anon";
GRANT REFERENCES ON TABLE public."garmon_user_ad_earnings" TO "anon";
GRANT TRIGGER ON TABLE public."garmon_user_ad_earnings" TO "anon";
GRANT TRUNCATE ON TABLE public."garmon_user_ad_earnings" TO "authenticated";
GRANT REFERENCES ON TABLE public."garmon_user_ad_earnings" TO "authenticated";
GRANT TRIGGER ON TABLE public."garmon_user_ad_earnings" TO "authenticated";
GRANT TRUNCATE ON TABLE public."garmondrop_moves" TO "anon";
GRANT REFERENCES ON TABLE public."garmondrop_moves" TO "anon";
GRANT TRIGGER ON TABLE public."garmondrop_moves" TO "anon";
GRANT TRUNCATE ON TABLE public."garmondrop_moves" TO "authenticated";
GRANT REFERENCES ON TABLE public."garmondrop_moves" TO "authenticated";
GRANT TRIGGER ON TABLE public."garmondrop_moves" TO "authenticated";
COMMIT;
