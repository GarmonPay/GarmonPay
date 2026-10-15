-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."social_fraud_flags" TO "anon";
GRANT REFERENCES ON TABLE public."social_fraud_flags" TO "anon";
GRANT TRIGGER ON TABLE public."social_fraud_flags" TO "anon";
GRANT TRUNCATE ON TABLE public."social_fraud_flags" TO "authenticated";
GRANT REFERENCES ON TABLE public."social_fraud_flags" TO "authenticated";
GRANT TRIGGER ON TABLE public."social_fraud_flags" TO "authenticated";
GRANT TRUNCATE ON TABLE public."social_task_completions" TO "anon";
GRANT REFERENCES ON TABLE public."social_task_completions" TO "anon";
GRANT TRIGGER ON TABLE public."social_task_completions" TO "anon";
GRANT TRUNCATE ON TABLE public."social_task_completions" TO "authenticated";
GRANT REFERENCES ON TABLE public."social_task_completions" TO "authenticated";
GRANT TRIGGER ON TABLE public."social_task_completions" TO "authenticated";
COMMIT;
