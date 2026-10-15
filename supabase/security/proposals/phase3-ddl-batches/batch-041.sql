-- Independent approval-only batch. No CRUD, row, policy or default changes.
BEGIN;
SET LOCAL lock_timeout = '5s';
REVOKE TRUNCATE,REFERENCES,TRIGGER ON TABLE public."mission_config" FROM PUBLIC,anon,authenticated;
REVOKE TRUNCATE,REFERENCES,TRIGGER ON TABLE public."mystery_box_config" FROM PUBLIC,anon,authenticated;
COMMIT;
