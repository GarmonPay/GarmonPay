-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."boxing_matches" TO "anon";
GRANT REFERENCES ON TABLE public."boxing_matches" TO "anon";
GRANT TRIGGER ON TABLE public."boxing_matches" TO "anon";
GRANT TRUNCATE ON TABLE public."boxing_matches" TO "authenticated";
GRANT REFERENCES ON TABLE public."boxing_matches" TO "authenticated";
GRANT TRIGGER ON TABLE public."boxing_matches" TO "authenticated";
GRANT TRUNCATE ON TABLE public."boxing_profiles" TO "anon";
GRANT REFERENCES ON TABLE public."boxing_profiles" TO "anon";
GRANT TRIGGER ON TABLE public."boxing_profiles" TO "anon";
GRANT TRUNCATE ON TABLE public."boxing_profiles" TO "authenticated";
GRANT REFERENCES ON TABLE public."boxing_profiles" TO "authenticated";
GRANT TRIGGER ON TABLE public."boxing_profiles" TO "authenticated";
COMMIT;
