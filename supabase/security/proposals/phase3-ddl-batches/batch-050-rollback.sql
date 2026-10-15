-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."referral_commissions" TO "anon";
GRANT REFERENCES ON TABLE public."referral_commissions" TO "anon";
GRANT TRIGGER ON TABLE public."referral_commissions" TO "anon";
GRANT TRUNCATE ON TABLE public."referral_commissions" TO "authenticated";
GRANT REFERENCES ON TABLE public."referral_commissions" TO "authenticated";
GRANT TRIGGER ON TABLE public."referral_commissions" TO "authenticated";
GRANT TRUNCATE ON TABLE public."referral_rewards" TO "anon";
GRANT REFERENCES ON TABLE public."referral_rewards" TO "anon";
GRANT TRIGGER ON TABLE public."referral_rewards" TO "anon";
GRANT TRUNCATE ON TABLE public."referral_rewards" TO "authenticated";
GRANT REFERENCES ON TABLE public."referral_rewards" TO "authenticated";
GRANT TRIGGER ON TABLE public."referral_rewards" TO "authenticated";
COMMIT;
