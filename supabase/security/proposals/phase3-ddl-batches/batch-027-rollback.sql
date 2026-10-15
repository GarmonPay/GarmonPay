-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."fighters" TO "anon";
GRANT REFERENCES ON TABLE public."fighters" TO "anon";
GRANT TRIGGER ON TABLE public."fighters" TO "anon";
GRANT TRUNCATE ON TABLE public."fighters" TO "authenticated";
GRANT REFERENCES ON TABLE public."fighters" TO "authenticated";
GRANT TRIGGER ON TABLE public."fighters" TO "authenticated";
GRANT TRUNCATE ON TABLE public."fights" TO "anon";
GRANT REFERENCES ON TABLE public."fights" TO "anon";
GRANT TRIGGER ON TABLE public."fights" TO "anon";
GRANT TRUNCATE ON TABLE public."fights" TO "authenticated";
GRANT REFERENCES ON TABLE public."fights" TO "authenticated";
GRANT TRIGGER ON TABLE public."fights" TO "authenticated";
COMMIT;
