-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."reward_budget" TO "anon";
GRANT REFERENCES ON TABLE public."reward_budget" TO "anon";
GRANT TRIGGER ON TABLE public."reward_budget" TO "anon";
GRANT TRUNCATE ON TABLE public."reward_budget" TO "authenticated";
GRANT REFERENCES ON TABLE public."reward_budget" TO "authenticated";
GRANT TRIGGER ON TABLE public."reward_budget" TO "authenticated";
GRANT TRUNCATE ON TABLE public."reward_budget_global" TO "anon";
GRANT REFERENCES ON TABLE public."reward_budget_global" TO "anon";
GRANT TRIGGER ON TABLE public."reward_budget_global" TO "anon";
GRANT TRUNCATE ON TABLE public."reward_budget_global" TO "authenticated";
GRANT REFERENCES ON TABLE public."reward_budget_global" TO "authenticated";
GRANT TRIGGER ON TABLE public."reward_budget_global" TO "authenticated";
COMMIT;
