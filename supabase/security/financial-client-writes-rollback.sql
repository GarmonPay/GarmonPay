-- Emergency rollback: restores verified pre-migration writes, including unsafe client financial access.
-- The prior eighteen-table protections remain untouched.
BEGIN;
GRANT INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public.profiles TO anon,authenticated;
GRANT INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public.advertisers TO anon,authenticated;
GRANT INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public.garmon_ads TO anon,authenticated;
GRANT INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public.garmon_engagement_sessions TO anon,authenticated;
GRANT INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public.video_watch_sessions TO anon,authenticated;
GRANT INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public.ad_sessions TO anon,authenticated;
GRANT INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public.withdrawals TO anon,authenticated;
GRANT INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public.withdrawal_requests TO anon,authenticated;
GRANT INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public.gc_conversions TO anon,authenticated;
GRANT INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public.gpay_redemptions TO anon,authenticated;
GRANT INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public.bets TO anon,authenticated;
GRANT INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public.referrals TO anon,authenticated;
COMMIT;
