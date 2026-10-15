-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."spin_wheel_spins" TO "anon";
GRANT REFERENCES ON TABLE public."spin_wheel_spins" TO "anon";
GRANT TRIGGER ON TABLE public."spin_wheel_spins" TO "anon";
GRANT TRUNCATE ON TABLE public."spin_wheel_spins" TO "authenticated";
GRANT REFERENCES ON TABLE public."spin_wheel_spins" TO "authenticated";
GRANT TRIGGER ON TABLE public."spin_wheel_spins" TO "authenticated";
GRANT TRUNCATE ON TABLE public."streak_config" TO "anon";
GRANT REFERENCES ON TABLE public."streak_config" TO "anon";
GRANT TRIGGER ON TABLE public."streak_config" TO "anon";
GRANT TRUNCATE ON TABLE public."streak_config" TO "authenticated";
GRANT REFERENCES ON TABLE public."streak_config" TO "authenticated";
GRANT TRIGGER ON TABLE public."streak_config" TO "authenticated";
COMMIT;
