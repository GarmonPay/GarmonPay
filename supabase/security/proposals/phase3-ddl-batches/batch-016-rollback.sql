-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."boxing_bets" TO "anon";
GRANT REFERENCES ON TABLE public."boxing_bets" TO "anon";
GRANT TRIGGER ON TABLE public."boxing_bets" TO "anon";
GRANT TRUNCATE ON TABLE public."boxing_bets" TO "authenticated";
GRANT REFERENCES ON TABLE public."boxing_bets" TO "authenticated";
GRANT TRIGGER ON TABLE public."boxing_bets" TO "authenticated";
GRANT TRUNCATE ON TABLE public."boxing_escrow" TO "anon";
GRANT REFERENCES ON TABLE public."boxing_escrow" TO "anon";
GRANT TRIGGER ON TABLE public."boxing_escrow" TO "anon";
GRANT TRUNCATE ON TABLE public."boxing_escrow" TO "authenticated";
GRANT REFERENCES ON TABLE public."boxing_escrow" TO "authenticated";
GRANT TRIGGER ON TABLE public."boxing_escrow" TO "authenticated";
COMMIT;
