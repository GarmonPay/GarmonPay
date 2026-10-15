-- Exact prior DDL grants for this focused proposal only. No CRUD is granted.
-- Recheck current ACLs and obtain authorization before any production use.
BEGIN;
SET LOCAL lock_timeout = '5s';
GRANT TRUNCATE, REFERENCES, TRIGGER ON TABLE public.ad_packages TO anon, authenticated;
GRANT TRUNCATE, REFERENCES, TRIGGER ON TABLE public.cpu_fighters TO anon, authenticated;
COMMIT;
