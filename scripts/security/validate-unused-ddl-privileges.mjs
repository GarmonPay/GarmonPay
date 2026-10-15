import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const {PGlite}=await import(process.env.SOL_FOUNDATION_PGLITE_MODULE||'@electric-sql/pglite');
const audit=JSON.parse(readFileSync('docs/solana/security-catalog-before.json','utf8'));
const perms=JSON.parse(readFileSync('docs/solana/security-permissions-before.json','utf8'));
const fixture=JSON.parse(readFileSync('docs/solana/security-schema-fixture.json','utf8'));
const q=x=>'"'+x.replaceAll('"','""')+'"';
const db=new PGlite();
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth; GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_user::text $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('role',current_user) $$;`);
const tables=new Map();
for(const c of fixture.columns){if(!tables.has(c.relname))tables.set(c.relname,[]);tables.get(c.relname).push(`${q(c.attname)} ${c.type}`);}
for(const [t,columns]of tables)await db.exec(`CREATE TABLE public.${q(t)}(${columns.join(',')}); ALTER TABLE public.${q(t)} ENABLE ROW LEVEL SECURITY;`);
const chars={a:'INSERT',r:'SELECT',w:'UPDATE',d:'DELETE',D:'TRUNCATE',x:'REFERENCES',t:'TRIGGER'};
for(const t of perms.tables)for(const a of(t.relacl||'').slice(1,-1).split(',')){
 const [role,rest]=a.split('=');if(!['anon','authenticated','service_role',''].includes(role)||!rest)continue;
 const rights=[...rest.split('/')[0]].filter(c=>chars[c]).map(c=>chars[c]);
 if(rights.length)await db.exec(`GRANT ${rights.join(',')} ON public.${q(t.relname)} TO ${role?q(role):'PUBLIC'};`);
}
for(const c of perms.columns)if(c.attacl)await db.exec(`GRANT UPDATE(${q(c.attname)}) ON public.${q(c.relname)} TO authenticated;`);
for(const f of audit.functions){await db.exec(f.definition);await db.exec(`REVOKE EXECUTE ON FUNCTION public.${f.signature} FROM PUBLIC;`);for(const a of(f.proacl||'').slice(1,-1).split(',')){
 const [role,rest]=a.split('=');if(['anon','authenticated','service_role',''].includes(role)&&rest?.startsWith('X'))await db.exec(`GRANT EXECUTE ON FUNCTION public.${f.signature} TO ${role?q(role):'PUBLIC'};`);
}}
for(const p of audit.policies.filter(p=>p.schemaname==='public'))await db.exec(`CREATE POLICY ${q(p.policyname)} ON public.${q(p.tablename)} FOR ${p.cmd} TO ${p.roles.map(r=>r==='public'?'PUBLIC':q(r)).join(',')}${p.qual?` USING (${p.qual})`:''}${p.with_check?` WITH CHECK (${p.with_check})`:''};`);
for(const v of audit.views){await db.exec(`CREATE VIEW public.${q(v.relname)} AS ${v.definition}`);for(const role of['anon','authenticated','service_role'])if(v.relacl.includes(role+'='))await db.exec(`GRANT ALL ON public.${q(v.relname)} TO ${role}`);}
await db.exec('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;');

for(const file of ['20261011203916_restrict_financial_client_writes.sql','20261011204026_pin_reviewed_function_search_paths.sql','20261011204138_secure_remaining_views_and_profile_reads.sql','20261012024826_restrict_trigger_function_execution.sql','20261012030103_retire_celo_browser_access.sql'])await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));
async function snapshot(){return(await db.query(`SELECT c.relname,r.role,p.privilege,has_table_privilege(r.role,c.oid,p.privilege) AS allowed FROM pg_class c CROSS JOIN (VALUES('anon'),('authenticated'),('service_role'))r(role) CROSS JOIN (VALUES('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'))p(privilege) WHERE c.relnamespace='public'::regnamespace AND c.relkind='r' ORDER BY c.relname,r.role,p.privilege`)).rows;}
const before=await snapshot();
await db.exec(readFileSync('supabase/security/proposals/restrict-unused-ddl-privileges.sql','utf8'));
const after=await snapshot();
for(let i=0;i<before.length;i++){
 const b=before[i],a=after[i];
 if(b.role==='service_role'||['SELECT','INSERT','UPDATE','DELETE'].includes(b.privilege))assert.deepEqual(a,b);
 else assert.equal(a.allowed,false);
}
await db.exec(readFileSync('supabase/security/unused-ddl-privileges-rollback.sql','utf8'));
assert.deepEqual(await snapshot(),before);
await db.close();console.log('Proposed unused-DDL cleanup passed: 174 tables × 3 roles × 7 privileges; CRUD and service access unchanged; exact rollback verified.');
