-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."viral_referrals" TO "anon";
GRANT REFERENCES ON TABLE public."viral_referrals" TO "anon";
GRANT TRIGGER ON TABLE public."viral_referrals" TO "anon";
GRANT TRUNCATE ON TABLE public."viral_referrals" TO "authenticated";
GRANT REFERENCES ON TABLE public."viral_referrals" TO "authenticated";
GRANT TRIGGER ON TABLE public."viral_referrals" TO "authenticated";
GRANT TRUNCATE ON TABLE public."waitlist" TO "anon";
GRANT REFERENCES ON TABLE public."waitlist" TO "anon";
GRANT TRIGGER ON TABLE public."waitlist" TO "anon";
GRANT TRUNCATE ON TABLE public."waitlist" TO "authenticated";
GRANT REFERENCES ON TABLE public."waitlist" TO "authenticated";
GRANT TRIGGER ON TABLE public."waitlist" TO "authenticated";
COMMIT;
