-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."team_members" TO "anon";
GRANT REFERENCES ON TABLE public."team_members" TO "anon";
GRANT TRIGGER ON TABLE public."team_members" TO "anon";
GRANT TRUNCATE ON TABLE public."team_members" TO "authenticated";
GRANT REFERENCES ON TABLE public."team_members" TO "authenticated";
GRANT TRIGGER ON TABLE public."team_members" TO "authenticated";
GRANT TRUNCATE ON TABLE public."teams" TO "anon";
GRANT REFERENCES ON TABLE public."teams" TO "anon";
GRANT TRIGGER ON TABLE public."teams" TO "anon";
GRANT TRUNCATE ON TABLE public."teams" TO "authenticated";
GRANT REFERENCES ON TABLE public."teams" TO "authenticated";
GRANT TRIGGER ON TABLE public."teams" TO "authenticated";
COMMIT;
