-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."user_badges" TO "anon";
GRANT REFERENCES ON TABLE public."user_badges" TO "anon";
GRANT TRIGGER ON TABLE public."user_badges" TO "anon";
GRANT TRUNCATE ON TABLE public."user_badges" TO "authenticated";
GRANT REFERENCES ON TABLE public."user_badges" TO "authenticated";
GRANT TRIGGER ON TABLE public."user_badges" TO "authenticated";
GRANT TRUNCATE ON TABLE public."user_referral_flip_welcome_bonus_claims" TO "anon";
GRANT REFERENCES ON TABLE public."user_referral_flip_welcome_bonus_claims" TO "anon";
GRANT TRIGGER ON TABLE public."user_referral_flip_welcome_bonus_claims" TO "anon";
GRANT TRUNCATE ON TABLE public."user_referral_flip_welcome_bonus_claims" TO "authenticated";
GRANT REFERENCES ON TABLE public."user_referral_flip_welcome_bonus_claims" TO "authenticated";
GRANT TRIGGER ON TABLE public."user_referral_flip_welcome_bonus_claims" TO "authenticated";
COMMIT;
