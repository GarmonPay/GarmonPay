-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."deposits" TO "anon";
GRANT REFERENCES ON TABLE public."deposits" TO "anon";
GRANT TRIGGER ON TABLE public."deposits" TO "anon";
GRANT TRUNCATE ON TABLE public."deposits" TO "authenticated";
GRANT REFERENCES ON TABLE public."deposits" TO "authenticated";
GRANT TRIGGER ON TABLE public."deposits" TO "authenticated";
GRANT TRUNCATE ON TABLE public."earnings" TO "anon";
GRANT REFERENCES ON TABLE public."earnings" TO "anon";
GRANT TRIGGER ON TABLE public."earnings" TO "anon";
GRANT TRUNCATE ON TABLE public."earnings" TO "authenticated";
GRANT REFERENCES ON TABLE public."earnings" TO "authenticated";
GRANT TRIGGER ON TABLE public."earnings" TO "authenticated";
COMMIT;
