-- Independent approval-only batch. No CRUD, row, policy or default changes.
BEGIN;
SET LOCAL lock_timeout = '5s';
REVOKE TRUNCATE,REFERENCES,TRIGGER ON TABLE public."garmon_ad_banned_users" FROM PUBLIC,anon,authenticated;
REVOKE TRUNCATE,REFERENCES,TRIGGER ON TABLE public."garmon_ad_blocked_keywords" FROM PUBLIC,anon,authenticated;
COMMIT;
