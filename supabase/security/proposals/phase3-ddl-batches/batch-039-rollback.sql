-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."launch_checklist" TO "anon";
GRANT REFERENCES ON TABLE public."launch_checklist" TO "anon";
GRANT TRIGGER ON TABLE public."launch_checklist" TO "anon";
GRANT TRUNCATE ON TABLE public."launch_checklist" TO "authenticated";
GRANT REFERENCES ON TABLE public."launch_checklist" TO "authenticated";
GRANT TRIGGER ON TABLE public."launch_checklist" TO "authenticated";
GRANT TRUNCATE ON TABLE public."membership_bonuses" TO "anon";
GRANT REFERENCES ON TABLE public."membership_bonuses" TO "anon";
GRANT TRIGGER ON TABLE public."membership_bonuses" TO "anon";
GRANT TRUNCATE ON TABLE public."membership_bonuses" TO "authenticated";
GRANT REFERENCES ON TABLE public."membership_bonuses" TO "authenticated";
GRANT TRIGGER ON TABLE public."membership_bonuses" TO "authenticated";
COMMIT;
