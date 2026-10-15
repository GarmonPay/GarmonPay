-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."escape_room_flags" TO "anon";
GRANT REFERENCES ON TABLE public."escape_room_flags" TO "anon";
GRANT TRIGGER ON TABLE public."escape_room_flags" TO "anon";
GRANT TRUNCATE ON TABLE public."escape_room_flags" TO "authenticated";
GRANT REFERENCES ON TABLE public."escape_room_flags" TO "authenticated";
GRANT TRIGGER ON TABLE public."escape_room_flags" TO "authenticated";
GRANT TRUNCATE ON TABLE public."escape_room_payouts" TO "anon";
GRANT REFERENCES ON TABLE public."escape_room_payouts" TO "anon";
GRANT TRIGGER ON TABLE public."escape_room_payouts" TO "anon";
GRANT TRUNCATE ON TABLE public."escape_room_payouts" TO "authenticated";
GRANT REFERENCES ON TABLE public."escape_room_payouts" TO "authenticated";
GRANT TRIGGER ON TABLE public."escape_room_payouts" TO "authenticated";
COMMIT;
