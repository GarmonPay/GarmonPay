-- Exact observed DDL grant restoration only; recheck drift before approved use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE ON TABLE public."stripe_payments" TO "anon";
GRANT REFERENCES ON TABLE public."stripe_payments" TO "anon";
GRANT TRIGGER ON TABLE public."stripe_payments" TO "anon";
GRANT TRUNCATE ON TABLE public."stripe_payments" TO "authenticated";
GRANT REFERENCES ON TABLE public."stripe_payments" TO "authenticated";
GRANT TRIGGER ON TABLE public."stripe_payments" TO "authenticated";
GRANT TRUNCATE ON TABLE public."stripe_subscriptions" TO "anon";
GRANT REFERENCES ON TABLE public."stripe_subscriptions" TO "anon";
GRANT TRIGGER ON TABLE public."stripe_subscriptions" TO "anon";
GRANT TRUNCATE ON TABLE public."stripe_subscriptions" TO "authenticated";
GRANT REFERENCES ON TABLE public."stripe_subscriptions" TO "authenticated";
GRANT TRIGGER ON TABLE public."stripe_subscriptions" TO "authenticated";
COMMIT;
