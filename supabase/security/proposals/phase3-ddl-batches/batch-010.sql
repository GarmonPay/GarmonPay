-- Independent approval-only batch. No CRUD, row, policy or default changes.
BEGIN;
SET LOCAL lock_timeout = '5s';
REVOKE TRUNCATE,REFERENCES,TRIGGER ON TABLE public."arena_season_pass" FROM PUBLIC,anon,authenticated;
REVOKE TRUNCATE,REFERENCES,TRIGGER ON TABLE public."arena_spectator_bets" FROM PUBLIC,anon,authenticated;
COMMIT;
