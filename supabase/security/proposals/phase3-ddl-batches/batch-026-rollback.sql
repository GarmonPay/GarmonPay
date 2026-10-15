-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."fight_escrow" TO "anon";
GRANT REFERENCES ON TABLE public."fight_escrow" TO "anon";
GRANT TRIGGER ON TABLE public."fight_escrow" TO "anon";
GRANT TRUNCATE ON TABLE public."fight_escrow" TO "authenticated";
GRANT REFERENCES ON TABLE public."fight_escrow" TO "authenticated";
GRANT TRIGGER ON TABLE public."fight_escrow" TO "authenticated";
GRANT TRUNCATE ON TABLE public."fight_history" TO "anon";
GRANT REFERENCES ON TABLE public."fight_history" TO "anon";
GRANT TRIGGER ON TABLE public."fight_history" TO "anon";
GRANT TRUNCATE ON TABLE public."fight_history" TO "authenticated";
GRANT REFERENCES ON TABLE public."fight_history" TO "authenticated";
GRANT TRIGGER ON TABLE public."fight_history" TO "authenticated";
COMMIT;
