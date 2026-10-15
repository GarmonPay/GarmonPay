-- Independent approval-only batch. No CRUD, row, policy or default changes.
BEGIN;
SET LOCAL lock_timeout = '5s';
REVOKE TRUNCATE,REFERENCES,TRIGGER ON TABLE public."fight_escrow" FROM PUBLIC,anon,authenticated;
REVOKE TRUNCATE,REFERENCES,TRIGGER ON TABLE public."fight_history" FROM PUBLIC,anon,authenticated;
COMMIT;
