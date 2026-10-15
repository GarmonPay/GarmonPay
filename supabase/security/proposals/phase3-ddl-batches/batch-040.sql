-- Independent approval-only batch. No CRUD, row, policy or default changes.
BEGIN;
SET LOCAL lock_timeout = '5s';
REVOKE TRUNCATE,REFERENCES,TRIGGER ON TABLE public."membership_plan_catalog" FROM PUBLIC,anon,authenticated;
REVOKE TRUNCATE,REFERENCES,TRIGGER ON TABLE public."mission_completions" FROM PUBLIC,anon,authenticated;
COMMIT;
