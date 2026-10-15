-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."pinball_games" TO "anon";
GRANT REFERENCES ON TABLE public."pinball_games" TO "anon";
GRANT TRIGGER ON TABLE public."pinball_games" TO "anon";
GRANT TRUNCATE ON TABLE public."pinball_games" TO "authenticated";
GRANT REFERENCES ON TABLE public."pinball_games" TO "authenticated";
GRANT TRIGGER ON TABLE public."pinball_games" TO "authenticated";
GRANT TRUNCATE ON TABLE public."pinball_jackpot" TO "anon";
GRANT REFERENCES ON TABLE public."pinball_jackpot" TO "anon";
GRANT TRIGGER ON TABLE public."pinball_jackpot" TO "anon";
GRANT TRUNCATE ON TABLE public."pinball_jackpot" TO "authenticated";
GRANT REFERENCES ON TABLE public."pinball_jackpot" TO "authenticated";
GRANT TRIGGER ON TABLE public."pinball_jackpot" TO "authenticated";
COMMIT;
