-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."gpay_claims" TO "anon";
GRANT REFERENCES ON TABLE public."gpay_claims" TO "anon";
GRANT TRIGGER ON TABLE public."gpay_claims" TO "anon";
GRANT TRUNCATE ON TABLE public."gpay_claims" TO "authenticated";
GRANT REFERENCES ON TABLE public."gpay_claims" TO "authenticated";
GRANT TRIGGER ON TABLE public."gpay_claims" TO "authenticated";
GRANT TRUNCATE ON TABLE public."gpay_ledger" TO "anon";
GRANT REFERENCES ON TABLE public."gpay_ledger" TO "anon";
GRANT TRIGGER ON TABLE public."gpay_ledger" TO "anon";
GRANT TRUNCATE ON TABLE public."gpay_ledger" TO "authenticated";
GRANT REFERENCES ON TABLE public."gpay_ledger" TO "authenticated";
GRANT TRIGGER ON TABLE public."gpay_ledger" TO "authenticated";
COMMIT;
