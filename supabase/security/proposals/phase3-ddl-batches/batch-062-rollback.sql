-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."tournaments" TO "anon";
GRANT REFERENCES ON TABLE public."tournaments" TO "anon";
GRANT TRIGGER ON TABLE public."tournaments" TO "anon";
GRANT TRUNCATE ON TABLE public."tournaments" TO "authenticated";
GRANT REFERENCES ON TABLE public."tournaments" TO "authenticated";
GRANT TRIGGER ON TABLE public."tournaments" TO "authenticated";
GRANT TRUNCATE ON TABLE public."transactions" TO "anon";
GRANT REFERENCES ON TABLE public."transactions" TO "anon";
GRANT TRIGGER ON TABLE public."transactions" TO "anon";
GRANT TRUNCATE ON TABLE public."transactions" TO "authenticated";
GRANT REFERENCES ON TABLE public."transactions" TO "authenticated";
GRANT TRIGGER ON TABLE public."transactions" TO "authenticated";
COMMIT;
