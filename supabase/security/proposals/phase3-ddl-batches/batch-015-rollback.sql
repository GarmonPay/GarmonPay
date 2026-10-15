-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."balances" TO "anon";
GRANT REFERENCES ON TABLE public."balances" TO "anon";
GRANT TRIGGER ON TABLE public."balances" TO "anon";
GRANT TRUNCATE ON TABLE public."balances" TO "authenticated";
GRANT REFERENCES ON TABLE public."balances" TO "authenticated";
GRANT TRIGGER ON TABLE public."balances" TO "authenticated";
GRANT TRUNCATE ON TABLE public."banners" TO "anon";
GRANT REFERENCES ON TABLE public."banners" TO "anon";
GRANT TRIGGER ON TABLE public."banners" TO "anon";
GRANT TRUNCATE ON TABLE public."banners" TO "authenticated";
GRANT REFERENCES ON TABLE public."banners" TO "authenticated";
GRANT TRIGGER ON TABLE public."banners" TO "authenticated";
COMMIT;
