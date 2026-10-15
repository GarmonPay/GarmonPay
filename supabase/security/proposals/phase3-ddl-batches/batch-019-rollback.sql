-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."coin_transactions" TO "anon";
GRANT REFERENCES ON TABLE public."coin_transactions" TO "anon";
GRANT TRIGGER ON TABLE public."coin_transactions" TO "anon";
GRANT TRUNCATE ON TABLE public."coin_transactions" TO "authenticated";
GRANT REFERENCES ON TABLE public."coin_transactions" TO "authenticated";
GRANT TRIGGER ON TABLE public."coin_transactions" TO "authenticated";
GRANT TRUNCATE ON TABLE public."cpu_fighters" TO "anon";
GRANT REFERENCES ON TABLE public."cpu_fighters" TO "anon";
GRANT TRIGGER ON TABLE public."cpu_fighters" TO "anon";
GRANT TRUNCATE ON TABLE public."cpu_fighters" TO "authenticated";
GRANT REFERENCES ON TABLE public."cpu_fighters" TO "authenticated";
GRANT TRIGGER ON TABLE public."cpu_fighters" TO "authenticated";
COMMIT;
