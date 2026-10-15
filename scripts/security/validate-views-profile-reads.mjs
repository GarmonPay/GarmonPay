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

const own='11111111-1111-1111-1111-111111111111',other='22222222-2222-2222-2222-222222222222';
await db.exec(`INSERT INTO users(id,email)VALUES('${own}','synthetic1@example.invalid'),('${other}','synthetic2@example.invalid'); INSERT INTO garmon_ads(user_id,status,is_active)VALUES('${own}','draft',true),('${other}','active',true);`);
await db.exec('INSERT INTO analytics_events DEFAULT VALUES; INSERT INTO cpu_fighters DEFAULT VALUES;');
await db.exec(readFileSync('supabase/migrations/20261011204138_secure_remaining_views_and_profile_reads.sql','utf8'));
await db.exec('SET ROLE anon;');
assert.equal((await db.query('SELECT count(*)::int AS n FROM ad_campaign_submissions')).rows[0].n,1);
assert.equal((await db.query('SELECT count(*)::int AS n FROM analytics_events')).rows[0].n,0);
assert.equal((await db.query('SELECT count(*)::int AS n FROM cpu_fighters')).rows[0].n,1);
for(const v of['admin_stats','total_deposits','admin_finance_overview'])await assert.rejects(db.query(`SELECT * FROM ${v}`),/permission denied/);
await db.exec(`RESET ROLE; SET ROLE authenticated; SET request.jwt.claim.sub='${own}';`);
assert.equal((await db.query('SELECT count(*)::int AS n FROM users')).rows[0].n,1);
assert.equal((await db.query('SELECT count(*)::int AS n FROM ad_campaign_submissions')).rows[0].n,2);
assert.equal((await db.query('SELECT count(*)::int AS n FROM analytics_events')).rows[0].n,0);
for(const role of['anon','authenticated'])assert.equal((await db.query("SELECT has_function_privilege($1,'garmondrop_cancel_room(uuid)','EXECUTE') AS ok",[role])).rows[0].ok,false);
await db.exec('RESET ROLE; SET ROLE service_role;');
assert.equal((await db.query('SELECT count(*)::int AS n FROM users')).rows[0].n,2);
assert.equal((await db.query('SELECT count(*)::int AS n FROM analytics_events')).rows[0].n,1);
for(const v of audit.views)await db.query(`SELECT count(*) FROM ${v.relname}`);
await db.exec('RESET ROLE;');
await db.exec(readFileSync('supabase/security/views-profile-reads-rollback.sql','utf8'));
await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub='${own}';`);
assert.equal((await db.query('SELECT count(*)::int AS n FROM users')).rows[0].n,2);
await db.exec('RESET ROLE;');
await db.close();console.log('View/privacy permission and rollback tests passed: draft campaigns private, own profiles isolated, analytics server-only, five views use invoker security, direct refund RPC paused, public CPU catalog and admin service reads preserved.');
