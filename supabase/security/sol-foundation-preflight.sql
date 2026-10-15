-- Read-only catalog inspection. Save privately before a reviewed, isolated migration.
BEGIN TRANSACTION READ ONLY;
SELECT current_database(), current_user;
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity, c.relacl
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND (c.relname='users' OR c.relname LIKE 'gp_sol_%') ORDER BY c.relname;
SELECT p.oid::regprocedure AS signature, p.prosecdef, p.proacl, pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname LIKE 'gp_sol_%' ORDER BY signature::text;
SELECT grantee,table_name,privilege_type FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name LIKE 'gp_sol_%' ORDER BY table_name,grantee,privilege_type;
SELECT rolname,rolsuper,rolinherit,rolbypassrls FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role');
SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check FROM pg_policies
WHERE schemaname='public' AND (tablename='users' OR tablename LIKE 'gp_sol_%') ORDER BY tablename,policyname;
ROLLBACK;
