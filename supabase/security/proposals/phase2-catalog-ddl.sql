-- Approval-only proposal, deliberately outside supabase/migrations.
-- Verified October 12, 2026: both tables have browser Dxt grants, RLS enabled,
-- and service CRUD. gc_packages already lacks these browser DDL grants and is excluded.
-- No data, CRUD, policies, defaults, views or function changes.
BEGIN;
SET LOCAL lock_timeout = '5s';
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.ad_packages FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.cpu_fighters FROM PUBLIC, anon, authenticated;
COMMIT;
