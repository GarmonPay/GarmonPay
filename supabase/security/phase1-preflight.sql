-- READ ONLY: run against staging/production only after review. No user data selected.
-- Save these results before any approved migration, for schema/grant review and exact rollback.
BEGIN READ ONLY;
SELECT version();
SELECT c.oid::regclass AS relation, pg_get_userbyid(c.relowner) AS owner, c.relacl,
       c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c WHERE c.oid = 'public.users'::regclass;
SELECT a.attname, a.attacl FROM pg_attribute a
WHERE a.attrelid = 'public.users'::regclass AND a.attnum > 0 AND NOT a.attisdropped;
SELECT p.oid::regprocedure AS signature, pg_get_userbyid(p.proowner) AS owner,
       p.prosecdef, p.proacl, p.proconfig, pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prokind = 'f' ORDER BY p.proname, p.oid;
SELECT * FROM pg_policies WHERE schemaname = 'public' AND tablename = 'users';
SELECT rolname, rolsuper, rolbypassrls, rolinherit FROM pg_roles
WHERE rolname IN ('anon', 'authenticated', 'service_role');
SELECT pg_get_userbyid(roleid) AS granted_role, pg_get_userbyid(member) AS member
FROM pg_auth_members;
ROLLBACK;
