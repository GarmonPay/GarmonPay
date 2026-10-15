-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."user_streaks" TO "anon";
GRANT REFERENCES ON TABLE public."user_streaks" TO "anon";
GRANT TRIGGER ON TABLE public."user_streaks" TO "anon";
GRANT TRUNCATE ON TABLE public."user_streaks" TO "authenticated";
GRANT REFERENCES ON TABLE public."user_streaks" TO "authenticated";
GRANT TRIGGER ON TABLE public."user_streaks" TO "authenticated";
GRANT TRUNCATE ON TABLE public."video_watch_completions" TO "anon";
GRANT REFERENCES ON TABLE public."video_watch_completions" TO "anon";
GRANT TRIGGER ON TABLE public."video_watch_completions" TO "anon";
GRANT TRUNCATE ON TABLE public."video_watch_completions" TO "authenticated";
GRANT REFERENCES ON TABLE public."video_watch_completions" TO "authenticated";
GRANT TRIGGER ON TABLE public."video_watch_completions" TO "authenticated";
COMMIT;
