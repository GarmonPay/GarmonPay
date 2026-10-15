-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."wallet_ledger" TO "anon";
GRANT REFERENCES ON TABLE public."wallet_ledger" TO "anon";
GRANT TRIGGER ON TABLE public."wallet_ledger" TO "anon";
GRANT TRUNCATE ON TABLE public."wallet_ledger" TO "authenticated";
GRANT REFERENCES ON TABLE public."wallet_ledger" TO "authenticated";
GRANT TRIGGER ON TABLE public."wallet_ledger" TO "authenticated";
GRANT TRUNCATE ON TABLE public."wallets" TO "anon";
GRANT REFERENCES ON TABLE public."wallets" TO "anon";
GRANT TRIGGER ON TABLE public."wallets" TO "anon";
GRANT TRUNCATE ON TABLE public."wallets" TO "authenticated";
GRANT REFERENCES ON TABLE public."wallets" TO "authenticated";
GRANT TRIGGER ON TABLE public."wallets" TO "authenticated";
COMMIT;
