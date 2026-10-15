-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."creator_videos" TO "anon";
GRANT REFERENCES ON TABLE public."creator_videos" TO "anon";
GRANT TRIGGER ON TABLE public."creator_videos" TO "anon";
GRANT TRUNCATE ON TABLE public."creator_videos" TO "authenticated";
GRANT REFERENCES ON TABLE public."creator_videos" TO "authenticated";
GRANT TRIGGER ON TABLE public."creator_videos" TO "authenticated";
GRANT TRUNCATE ON TABLE public."daily_rewards" TO "anon";
GRANT REFERENCES ON TABLE public."daily_rewards" TO "anon";
GRANT TRIGGER ON TABLE public."daily_rewards" TO "anon";
GRANT TRUNCATE ON TABLE public."daily_rewards" TO "authenticated";
GRANT REFERENCES ON TABLE public."daily_rewards" TO "authenticated";
GRANT TRIGGER ON TABLE public."daily_rewards" TO "authenticated";
COMMIT;
