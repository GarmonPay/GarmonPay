-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."mystery_box_opens" TO "anon";
GRANT REFERENCES ON TABLE public."mystery_box_opens" TO "anon";
GRANT TRIGGER ON TABLE public."mystery_box_opens" TO "anon";
GRANT TRUNCATE ON TABLE public."mystery_box_opens" TO "authenticated";
GRANT REFERENCES ON TABLE public."mystery_box_opens" TO "authenticated";
GRANT TRIGGER ON TABLE public."mystery_box_opens" TO "authenticated";
GRANT TRUNCATE ON TABLE public."owner_config" TO "anon";
GRANT REFERENCES ON TABLE public."owner_config" TO "anon";
GRANT TRIGGER ON TABLE public."owner_config" TO "anon";
GRANT TRUNCATE ON TABLE public."owner_config" TO "authenticated";
GRANT REFERENCES ON TABLE public."owner_config" TO "authenticated";
GRANT TRIGGER ON TABLE public."owner_config" TO "authenticated";
COMMIT;
