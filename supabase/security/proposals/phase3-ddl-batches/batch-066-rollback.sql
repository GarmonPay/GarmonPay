-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."wallet" TO "anon";
GRANT REFERENCES ON TABLE public."wallet" TO "anon";
GRANT TRIGGER ON TABLE public."wallet" TO "anon";
GRANT TRUNCATE ON TABLE public."wallet" TO "authenticated";
GRANT REFERENCES ON TABLE public."wallet" TO "authenticated";
GRANT TRIGGER ON TABLE public."wallet" TO "authenticated";
GRANT TRUNCATE ON TABLE public."wallet_balances" TO "anon";
GRANT REFERENCES ON TABLE public."wallet_balances" TO "anon";
GRANT TRIGGER ON TABLE public."wallet_balances" TO "anon";
GRANT TRUNCATE ON TABLE public."wallet_balances" TO "authenticated";
GRANT REFERENCES ON TABLE public."wallet_balances" TO "authenticated";
GRANT TRIGGER ON TABLE public."wallet_balances" TO "authenticated";
COMMIT;
