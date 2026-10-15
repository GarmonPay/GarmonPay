-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."garmon_ad_banned_users" TO "anon";
GRANT REFERENCES ON TABLE public."garmon_ad_banned_users" TO "anon";
GRANT TRIGGER ON TABLE public."garmon_ad_banned_users" TO "anon";
GRANT TRUNCATE ON TABLE public."garmon_ad_banned_users" TO "authenticated";
GRANT REFERENCES ON TABLE public."garmon_ad_banned_users" TO "authenticated";
GRANT TRIGGER ON TABLE public."garmon_ad_banned_users" TO "authenticated";
GRANT TRUNCATE ON TABLE public."garmon_ad_blocked_keywords" TO "anon";
GRANT REFERENCES ON TABLE public."garmon_ad_blocked_keywords" TO "anon";
GRANT TRIGGER ON TABLE public."garmon_ad_blocked_keywords" TO "anon";
GRANT TRUNCATE ON TABLE public."garmon_ad_blocked_keywords" TO "authenticated";
GRANT REFERENCES ON TABLE public."garmon_ad_blocked_keywords" TO "authenticated";
GRANT TRIGGER ON TABLE public."garmon_ad_blocked_keywords" TO "authenticated";
COMMIT;
