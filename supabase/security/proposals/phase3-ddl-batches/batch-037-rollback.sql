-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."garmondrop_rooms" TO "anon";
GRANT REFERENCES ON TABLE public."garmondrop_rooms" TO "anon";
GRANT TRIGGER ON TABLE public."garmondrop_rooms" TO "anon";
GRANT TRUNCATE ON TABLE public."garmondrop_rooms" TO "authenticated";
GRANT REFERENCES ON TABLE public."garmondrop_rooms" TO "authenticated";
GRANT TRIGGER ON TABLE public."garmondrop_rooms" TO "authenticated";
GRANT TRUNCATE ON TABLE public."gpay_balances" TO "anon";
GRANT REFERENCES ON TABLE public."gpay_balances" TO "anon";
GRANT TRIGGER ON TABLE public."gpay_balances" TO "anon";
GRANT TRUNCATE ON TABLE public."gpay_balances" TO "authenticated";
GRANT REFERENCES ON TABLE public."gpay_balances" TO "authenticated";
GRANT TRIGGER ON TABLE public."gpay_balances" TO "authenticated";
COMMIT;
