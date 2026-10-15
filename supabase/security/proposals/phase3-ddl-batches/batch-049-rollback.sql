-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."referral_bonus" TO "anon";
GRANT REFERENCES ON TABLE public."referral_bonus" TO "anon";
GRANT TRIGGER ON TABLE public."referral_bonus" TO "anon";
GRANT TRUNCATE ON TABLE public."referral_bonus" TO "authenticated";
GRANT REFERENCES ON TABLE public."referral_bonus" TO "authenticated";
GRANT TRIGGER ON TABLE public."referral_bonus" TO "authenticated";
GRANT TRUNCATE ON TABLE public."referral_commission_config" TO "anon";
GRANT REFERENCES ON TABLE public."referral_commission_config" TO "anon";
GRANT TRIGGER ON TABLE public."referral_commission_config" TO "anon";
GRANT TRUNCATE ON TABLE public."referral_commission_config" TO "authenticated";
GRANT REFERENCES ON TABLE public."referral_commission_config" TO "authenticated";
GRANT TRIGGER ON TABLE public."referral_commission_config" TO "authenticated";
COMMIT;
