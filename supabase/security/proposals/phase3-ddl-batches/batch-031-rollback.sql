-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."gamification_config" TO "anon";
GRANT REFERENCES ON TABLE public."gamification_config" TO "anon";
GRANT TRIGGER ON TABLE public."gamification_config" TO "anon";
GRANT TRUNCATE ON TABLE public."gamification_config" TO "authenticated";
GRANT REFERENCES ON TABLE public."gamification_config" TO "authenticated";
GRANT TRIGGER ON TABLE public."gamification_config" TO "authenticated";
GRANT TRUNCATE ON TABLE public."gamification_rewards" TO "anon";
GRANT REFERENCES ON TABLE public."gamification_rewards" TO "anon";
GRANT TRIGGER ON TABLE public."gamification_rewards" TO "anon";
GRANT TRUNCATE ON TABLE public."gamification_rewards" TO "authenticated";
GRANT REFERENCES ON TABLE public."gamification_rewards" TO "authenticated";
GRANT TRIGGER ON TABLE public."gamification_rewards" TO "authenticated";
COMMIT;
