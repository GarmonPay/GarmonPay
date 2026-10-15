-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."game_waitlist" TO "anon";
GRANT REFERENCES ON TABLE public."game_waitlist" TO "anon";
GRANT TRIGGER ON TABLE public."game_waitlist" TO "anon";
GRANT TRUNCATE ON TABLE public."game_waitlist" TO "authenticated";
GRANT REFERENCES ON TABLE public."game_waitlist" TO "authenticated";
GRANT TRIGGER ON TABLE public."game_waitlist" TO "authenticated";
GRANT TRUNCATE ON TABLE public."gamification" TO "anon";
GRANT REFERENCES ON TABLE public."gamification" TO "anon";
GRANT TRIGGER ON TABLE public."gamification" TO "anon";
GRANT TRUNCATE ON TABLE public."gamification" TO "authenticated";
GRANT REFERENCES ON TABLE public."gamification" TO "authenticated";
GRANT TRIGGER ON TABLE public."gamification" TO "authenticated";
COMMIT;
