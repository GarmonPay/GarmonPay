-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."membership_plan_catalog" TO "anon";
GRANT REFERENCES ON TABLE public."membership_plan_catalog" TO "anon";
GRANT TRIGGER ON TABLE public."membership_plan_catalog" TO "anon";
GRANT TRUNCATE ON TABLE public."membership_plan_catalog" TO "authenticated";
GRANT REFERENCES ON TABLE public."membership_plan_catalog" TO "authenticated";
GRANT TRIGGER ON TABLE public."membership_plan_catalog" TO "authenticated";
GRANT TRUNCATE ON TABLE public."mission_completions" TO "anon";
GRANT REFERENCES ON TABLE public."mission_completions" TO "anon";
GRANT TRIGGER ON TABLE public."mission_completions" TO "anon";
GRANT TRUNCATE ON TABLE public."mission_completions" TO "authenticated";
GRANT REFERENCES ON TABLE public."mission_completions" TO "authenticated";
GRANT TRIGGER ON TABLE public."mission_completions" TO "authenticated";
COMMIT;
