-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."platform_balance" TO "anon";
GRANT REFERENCES ON TABLE public."platform_balance" TO "anon";
GRANT TRIGGER ON TABLE public."platform_balance" TO "anon";
GRANT TRUNCATE ON TABLE public."platform_balance" TO "authenticated";
GRANT REFERENCES ON TABLE public."platform_balance" TO "authenticated";
GRANT TRIGGER ON TABLE public."platform_balance" TO "authenticated";
GRANT TRUNCATE ON TABLE public."platform_earnings" TO "anon";
GRANT REFERENCES ON TABLE public."platform_earnings" TO "anon";
GRANT TRIGGER ON TABLE public."platform_earnings" TO "anon";
GRANT TRUNCATE ON TABLE public."platform_earnings" TO "authenticated";
GRANT REFERENCES ON TABLE public."platform_earnings" TO "authenticated";
GRANT TRIGGER ON TABLE public."platform_earnings" TO "authenticated";
COMMIT;
