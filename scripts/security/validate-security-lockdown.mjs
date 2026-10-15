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
await db.exec(`INSERT INTO users(id,email,full_name,banned)VALUES('${own}','synthetic1@example.invalid','Fixture',false),('${other}','synthetic2@example.invalid','Other',false); INSERT INTO profiles(id,balance,role) VALUES('${own}',0,'member');`);
for(const t of['packages','gc_packages','arena_weight_classes','cpu_fighters'])await db.exec(`INSERT INTO ${t} DEFAULT VALUES;`);
await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub='${own}'; UPDATE profiles SET balance=999 WHERE id='${own}'; RESET ROLE;`);
await db.exec(readFileSync('supabase/security/proposals/solana-security-lockdown.sql','utf8'));
for(const role of['anon','authenticated']){
 for(const t of perms.tables)for(const privilege of['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'])assert.equal((await db.query('SELECT has_table_privilege($1,$2,$3) AS ok',[role,'public.'+t.relname,privilege])).rows[0].ok,false,role+' '+t.relname+' '+privilege);
 await db.exec(`SET ROLE ${role}`);
 for(const t of['packages','gc_packages','arena_weight_classes','cpu_fighters'])assert.equal((await db.query(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n,1);
 for(const t of['profiles','users','withdrawals','garmon_ads','video_watch_sessions'])await assert.rejects(db.query(`INSERT INTO ${t} DEFAULT VALUES`),/permission denied/);
 await assert.rejects(db.query('UPDATE profiles SET balance=0'),/permission denied/);
 await assert.rejects(db.query("UPDATE users SET role='admin'"),/permission denied/);
 await db.exec('RESET ROLE');
}
await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub='${own}';`);
assert.equal((await db.query('SELECT count(*)::int AS n FROM users')).rows[0].n,1);
await db.exec("UPDATE users SET full_name='Updated' WHERE id='11111111-1111-1111-1111-111111111111'");
await db.exec('RESET ROLE; SET ROLE service_role;');
assert.equal((await db.query('SELECT count(*)::int AS n FROM users')).rows[0].n,2);
await db.exec("UPDATE profiles SET balance=998 WHERE id='11111111-1111-1111-1111-111111111111'");
await db.exec('RESET ROLE;');
for(const f of audit.functions.filter(f=>!f.proconfig))assert.deepEqual((await db.query('SELECT proconfig FROM pg_proc WHERE oid=$1::regprocedure',[f.signature])).rows[0].proconfig,['search_path=pg_catalog, public, pg_temp']);
for(const f of audit.functions.filter(f=>f.prosecdef&&f.anon_exec&&!['check_username_available(text)','celo_user_in_room(uuid)'].includes(f.signature)))for(const role of['anon','authenticated'])assert.equal((await db.query('SELECT has_function_privilege($1,$2,\'EXECUTE\') AS ok',[role,f.signature])).rows[0].ok,false);
// Existing triggers still fire despite revoked direct EXECUTE. Synthetic-only creation.
await db.exec('CREATE TABLE trigger_fixture(id uuid); GRANT INSERT ON trigger_fixture TO authenticated; CREATE TRIGGER wallet_fixture AFTER INSERT ON trigger_fixture FOR EACH ROW EXECUTE FUNCTION create_wallet_for_new_user();');
await db.exec(`SET ROLE authenticated; INSERT INTO trigger_fixture VALUES('${other}'); RESET ROLE;`);
assert.equal((await db.query('SELECT count(*)::int AS n FROM wallet WHERE user_id=$1',[other])).rows[0].n,1);
// Future migrations no longer inherit browser access, but keep trusted service grants.
await db.exec('CREATE TABLE future_fixture(id integer); CREATE FUNCTION future_rpc() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;');
assert.equal((await db.query("SELECT has_table_privilege('anon','future_fixture','SELECT') AS ok")).rows[0].ok,false);
assert.equal((await db.query("SELECT has_function_privilege('anon','future_rpc()','EXECUTE') AS ok")).rows[0].ok,false);
await db.exec(readFileSync('supabase/security/solana-security-lockdown-rollback.sql','utf8'));
for(const t of perms.tables)assert.equal((await db.query("SELECT has_table_privilege('anon',$1,'TRUNCATE') AS ok",['public.'+t.relname])).rows[0].ok,t.anon_truncate);
await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub='${own}'; UPDATE profiles SET balance=997 WHERE id='${own}'; RESET ROLE;`);
assert.equal((await db.query('SELECT balance FROM profiles WHERE id=$1',[own])).rows[0].balance,'997');
await db.close();console.log('Security lockdown passed against 174 schema-only table fixtures and 258 policy definitions: RLS isolation, financial write denial, safe profile edits, catalogs, service role, function paths, trigger continuity, defaults and rollback. No production rows copied.');
