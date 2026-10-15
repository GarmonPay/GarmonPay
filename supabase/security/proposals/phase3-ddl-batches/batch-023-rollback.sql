-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."escape_room_player_status" TO "anon";
GRANT REFERENCES ON TABLE public."escape_room_player_status" TO "anon";
GRANT TRIGGER ON TABLE public."escape_room_player_status" TO "anon";
GRANT TRUNCATE ON TABLE public."escape_room_player_status" TO "authenticated";
GRANT REFERENCES ON TABLE public."escape_room_player_status" TO "authenticated";
GRANT TRIGGER ON TABLE public."escape_room_player_status" TO "authenticated";
GRANT TRUNCATE ON TABLE public."escape_room_puzzles" TO "anon";
GRANT REFERENCES ON TABLE public."escape_room_puzzles" TO "anon";
GRANT TRIGGER ON TABLE public."escape_room_puzzles" TO "anon";
GRANT TRUNCATE ON TABLE public."escape_room_puzzles" TO "authenticated";
GRANT REFERENCES ON TABLE public."escape_room_puzzles" TO "authenticated";
GRANT TRIGGER ON TABLE public."escape_room_puzzles" TO "authenticated";
COMMIT;
