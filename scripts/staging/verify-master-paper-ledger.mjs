import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const runtime=process.env.GARMONPAY_PG_RUNTIME;
if(!runtime) throw new Error('Set GARMONPAY_PG_RUNTIME to the isolated test runtime directory containing package.json; no production database URL is accepted.');
const require=createRequire(resolve(runtime,'package.json'));
const {default:EmbeddedPostgres}=await import(pathToFileURL(require.resolve('embedded-postgres')).href);
const pg=require('pg');
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const root=process.cwd()+'/';
const cluster=new EmbeddedPostgres({databaseDir:'/private/tmp/gp-master-ledger-data',user:'postgres',password:'isolated-test-only',port:55448,persistent:false,onLog:()=>{},onError:()=>{}});
const clients=[]; const results=[];
async function test(name,fn){await fn();results.push(name);console.log('PASS',name);}
try{
await cluster.initialise();await cluster.start();
async function connection(role){const c=new pg.Client({host:'127.0.0.1',port:55448,user:'postgres',password:'isolated-test-only',database:'postgres'});await c.connect();clients.push(c);if(role)await c.query(`SET ROLE ${role}`);return c;}
const admin=await connection();
await admin.query('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE ROLE authenticator NOLOGIN NOINHERIT; GRANT USAGE ON SCHEMA public TO service_role;');
await admin.query('CREATE ROLE migration_owner NOLOGIN CREATEROLE BYPASSRLS; GRANT USAGE,CREATE ON SCHEMA public TO migration_owner WITH GRANT OPTION; SET ROLE migration_owner');
await admin.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role');
for(const f of ['supabase/security/staging/phase1-wallet-identity.sql','supabase/security/staging/phase3-session-rotation.sql','supabase/security/phase1-review/supabase/migrations/20261012221843_phase1_03_members.sql','supabase/security/phase1-review/supabase/migrations/20261014021340_members_private_by_default.sql','supabase/security/production/20261014_member_display_referral.sql'])await admin.query(readFileSync(root+f,'utf8'));
const a=await connection('service_role'),b=await connection('service_role');
const wallets=['1','2','3','4'].map(x=>x.repeat(32)), hashes=['a','b','c','d'].map(x=>x.repeat(64)),members=[];
for(let i=0;i<4;i++)members.push((await a.query("SELECT gp_sol_member_login($1,$2,now()+interval '30 minutes',null,null) id",[wallets[i],hashes[i]])).rows[0].id);
const baseline=(await admin.query("SELECT jsonb_build_object('identities',(SELECT jsonb_agg(i) FROM gp_sol_identities i),'sessions',(SELECT jsonb_agg(s) FROM gp_sol_sessions s),'members',(SELECT jsonb_agg(m) FROM gp_sol_members m)) snapshot")).rows[0].snapshot;
await test('migration applies on native PostgreSQL as non-superuser owner',async()=>{await admin.query(readFileSync(root+'supabase/security/review/20261015_member_wallet_workspace.sql','utf8'));console.log((await admin.query('select version()')).rows[0]);});
const publisher=await connection('gp_member_price_publisher');
async function observation(symbol='BTC',age=0){const id=randomUUID();await publisher.query("INSERT INTO gp_member_price_observations(id,symbol,asset_id,source,token_microusd,sol_microusd,observed_at,sol_observed_at) VALUES($1,$2,$3,'coingecko',50000000000,100000000,clock_timestamp()-$4*interval '1 second',clock_timestamp()-$4*interval '1 second')",[id,symbol,symbol==='BTC'?'bitcoin':'ethereum',age]);return id;}
const quote=await observation();
const fill=(c,hash,request=randomUUID(),amount='1000000000',obs=quote,side='buy',sell=null)=>c.query('SELECT gp_member_record_paper_fill($1,$2,$3,$4,$5,$6,$7) result',[hash,'BTC',side,amount,sell,request,obs]);
await test('new accounts have exactly 10 virtual SOL; workspace isolated',async()=>{for(const h of hashes)assert.equal((await a.query('SELECT gp_member_workspace($1) w',[h])).rows[0].w.cashLamports,'10000000000');});
await test('buy, partial sell, full close; no ambiguous columns or trigger errors',async()=>{await fill(a,hashes[0]);const units=(await a.query('select gp_member_workspace($1) w',[hashes[0]])).rows[0].w.positions[0].microUnits;await fill(a,hashes[0],randomUUID(),null,quote,'sell',units);assert.equal((await a.query('SELECT gp_member_workspace($1) w',[hashes[0]])).rows[0].w.positions.length,0);});
await test('duplicate retry returns original result and conflicting payload is rejected',async()=>{const id=randomUUID(),first=await fill(a,hashes[0],id);assert.deepEqual((await fill(a,hashes[0],id)).rows,first.rows);await assert.rejects(fill(a,hashes[0],id,'2000000000'),/different order/);});
await test('two independent backend connections serialize duplicate request; debit once',async()=>{assert.notEqual((await a.query('select pg_backend_pid() pid')).rows[0].pid,(await b.query('select pg_backend_pid() pid')).rows[0].pid);const id=randomUUID();await a.query('BEGIN');const first=await fill(a,hashes[1],id);let done=false;const second=fill(b,hashes[1],id).then(x=>{done=true;return x});await new Promise(r=>setTimeout(r,150));assert.equal(done,false);await a.query('COMMIT');assert.deepEqual((await second).rows,first.rows);assert.equal((await admin.query('select cash_lamports::text cash from gp_member_paper_accounts where member_id=$1',[members[1]])).rows[0].cash,'9000000000');});
await test('two independent connections cannot overspend; one order fails after lock',async()=>{await a.query('BEGIN');await fill(a,hashes[2],randomUUID(),'7000000000');const second=fill(b,hashes[2],randomUUID(),'7000000000');const rejected=assert.rejects(second,/not available/);await new Promise(r=>setTimeout(r,100));await a.query('COMMIT');await rejected;assert.equal((await admin.query('select cash_lamports::text cash from gp_member_paper_accounts where member_id=$1',[members[2]])).rows[0].cash,'3000000000');});
await test('session revoked while waiting on another connection is rejected after lock',async()=>{
await a.query('BEGIN');await a.query('select gp_member_workspace($1)',[hashes[1]]);
await admin.query('BEGIN');await admin.query('select member_id from gp_member_paper_accounts where member_id=$1 for update',[members[1]]);
const pending=fill(b,hashes[1]);const rejected=assert.rejects(pending,/Unauthorized/);
await new Promise(r=>setTimeout(r,100));
const revoker=await connection();await revoker.query('update gp_sol_sessions set revoked_at=clock_timestamp() where token_hash=$1',[hashes[1]]);
await admin.query('COMMIT');await a.query('COMMIT');await rejected;
await revoker.query('update gp_sol_sessions set revoked_at=null where token_hash=$1',[hashes[1]]);
});
await test('unknown, stale, unsupported, future and unverified prices refused',async()=>{await assert.rejects(fill(a,hashes[0],randomUUID(),'1',randomUUID()),/Fresh verified/);await assert.rejects(observation('BTC',61));await assert.rejects(observation('BTC',-10));const id=await observation();await admin.query('ALTER TABLE gp_member_price_observations DISABLE TRIGGER immutable');await admin.query("update gp_member_price_observations set observed_at=now()-interval '2 minutes' where id=$1",[id]);await admin.query('ALTER TABLE gp_member_price_observations ENABLE TRIGGER immutable');await assert.rejects(fill(a,hashes[0],randomUUID(),'1000000000',id),/Fresh verified/);await assert.rejects(publisher.query("INSERT INTO gp_member_price_observations(symbol,asset_id,source,token_microusd,sol_microusd,observed_at,sol_observed_at) VALUES('DOGE','dogecoin','browser',1,1,now(),now())"));});
await test('service role cannot fabricate fills, publish prices, reset accounts or forge write setting',async()=>{await a.query("set gp_member.paper_write='on'");for(const table of ['gp_member_paper_accounts','gp_member_paper_positions','gp_member_paper_fills','gp_member_ad_drafts','gp_member_audit','gp_member_price_observations','gp_member_ranking_decisions','gp_member_paper_rank_archives']){await assert.rejects(a.query(`DELETE FROM ${table}`),/permission denied/);await assert.rejects(a.query(`UPDATE ${table} SET member_id=member_id`));}await assert.rejects(a.query("INSERT INTO gp_member_paper_accounts(member_id,cash_lamports) VALUES($1,10000000000)",[randomUUID()]),/permission denied/);});
await test('expired, revoked, banned, missing and wallet-mismatched sessions denied',async()=>{for(const mode of ['expired','revoked','banned','missing','mismatch']){await admin.query("UPDATE gp_sol_sessions SET created_at=now(),expires_at=now()+interval '30 minutes',revoked_at=null WHERE token_hash=$1",[hashes[3]]);await admin.query('update gp_sol_identities set banned=false where wallet_address=$1',[wallets[3]]);if(mode==='expired')await admin.query("update gp_sol_sessions set created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' where token_hash=$1",[hashes[3]]);if(mode==='revoked')await admin.query('update gp_sol_sessions set revoked_at=now() where token_hash=$1',[hashes[3]]);if(mode==='banned')await admin.query('update gp_sol_identities set banned=true where wallet_address=$1',[wallets[3]]);if(mode==='mismatch')await admin.query('update gp_sol_sessions set wallet_address=$1 where token_hash=$2',[wallets[0],hashes[3]]);if(mode==='mismatch'){const w=(await a.query('select gp_member_workspace($1) w',[hashes[3]])).rows[0].w;assert.equal(w.cashLamports,(await a.query('select gp_member_workspace($1) w',[hashes[0]])).rows[0].w.cashLamports);}else await assert.rejects(fill(a,mode==='missing'?'f'.repeat(64):hashes[3]),/Unauthorized/);}
});
await test('drafts unpaid, fixed packages and private per member',async()=>{await a.query("select gp_member_save_ad_draft($1,'Draft','https://example.org','seconds5',1000)",[hashes[0]]);assert.equal((await a.query('select gp_member_workspace($1) w',[hashes[1]])).rows[0].w.drafts.length,0);await assert.rejects(a.query("select gp_member_save_ad_draft($1,'Draft','https://example.org','seconds5',501)",[hashes[0]]));await assert.rejects(a.query("select gp_member_save_ad_draft($1,'Draft','https://example.org','seconds5',null)",[hashes[0]]));});
await test('anonymous and authenticated have no table or function access; FORCE RLS covers eight tables',async()=>{for(const role of ['anon','authenticated']){const c=await connection(role);await assert.rejects(c.query('select gp_member_workspace($1)',[hashes[0]]),/permission denied/);for(const t of ['paper_accounts','paper_positions','paper_fills','ad_drafts','audit','price_observations','ranking_decisions','paper_rank_archives'])await assert.rejects(c.query(`select * from gp_member_${t}`),/permission denied/);}assert.equal((await admin.query("select count(*)::int n from pg_class where relname like 'gp_member_%' and relkind='r' and relrowsecurity and relforcerowsecurity")).rows[0].n,8);});
await test('complete table grants, function owners, role isolation and RLS deny-by-default',async()=>{
const tables=['paper_accounts','paper_positions','paper_fills','ad_drafts','audit','price_observations','ranking_decisions','paper_rank_archives'].map(x=>'gp_member_'+x);
for(const role of ['anon','authenticated','service_role'])for(const t of tables)for(const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'])assert.equal((await admin.query('select has_table_privilege($1,$2,$3) allowed',[role,t,privilege])).rows[0].allowed,false,role+' '+t+' '+privilege);
const functions=(await admin.query("select p.oid::regprocedure::text signature, p.prosecdef, p.proconfig, r.rolname owner from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner where n.nspname='public' and p.proname like 'gp_member_%'")).rows;
for(const f of functions){for(const role of ['anon','authenticated'])assert.equal((await admin.query('select has_function_privilege($1,$2,chr(69)||chr(88)||chr(69)||chr(67)||chr(85)||chr(84)||chr(69)) allowed',[role,f.signature])).rows[0].allowed,false);if(f.prosecdef){assert.equal(f.owner,'gp_member_executor');assert.ok(f.proconfig.includes('search_path=""'));}}
for(const role of ['gp_member_executor','gp_member_price_publisher']){const row=(await admin.query('select rolsuper,rolbypassrls,rolcanlogin from pg_roles where rolname=$1',[role])).rows[0];assert.deepEqual(row,{rolsuper:false,rolbypassrls:false,rolcanlogin:false});assert.equal((await admin.query("select pg_has_role('service_role',$1,'MEMBER') allowed",[role])).rows[0].allowed,false);}
await admin.query('CREATE ROLE rls_probe NOLOGIN NOBYPASSRLS');await admin.query('GRANT USAGE ON SCHEMA public TO rls_probe');
for(const t of tables)await admin.query('GRANT SELECT ON '+t+' TO rls_probe');const probe=await connection('rls_probe');for(const t of tables)assert.equal((await probe.query('select count(*)::int n from '+t)).rows[0].n,0);
for(const t of tables)await admin.query('REVOKE SELECT ON '+t+' FROM rls_probe');await admin.query('REVOKE USAGE ON SCHEMA public FROM rls_probe');
const superuser=await connection();await superuser.query('DROP ROLE rls_probe');
});
await test('rankings default excluded; operator eligibility is append-only and prospective',async()=>{assert.deepEqual((await a.query("select gp_member_paper_rankings('daily') r")).rows[0].r,[]);await admin.query("insert into gp_member_ranking_decisions(member_id,eligible,reason) values($1,true,'Synthetic wallet reviewed for test')",[members[0]]);assert.deepEqual((await a.query("select gp_member_paper_rankings('daily') r")).rows[0].r,[]);await fill(a,hashes[0]);assert.equal((await a.query("select gp_member_paper_rankings('daily') r")).rows[0].r.length,0); // Prior trades cannot be retroactively enrolled
const rankHash='9'.repeat(64);const rankId=(await a.query("SELECT gp_sol_member_login($1,$2,now()+interval '30 minutes',null,null) id",['9'.repeat(32),rankHash])).rows[0].id;await a.query('select gp_member_workspace($1)',[rankHash]);await admin.query("insert into gp_member_ranking_decisions(member_id,eligible,reason) values($1,true,'Fresh account approved before first fill')",[rankId]);await fill(a,rankHash);const ranked=(await a.query("select gp_member_paper_rankings('daily') r")).rows[0].r;assert.equal(ranked.length,1);assert.ok(Number(ranked[0].returnBps)<0);assert.equal(ranked[0].memberId,rankId);await admin.query('delete from gp_sol_sessions where token_hash=$1',[rankHash]);await assert.rejects(admin.query('delete from gp_member_ranking_decisions'),/Append-only/);await assert.rejects(admin.query('delete from gp_member_paper_fills'),/cannot be changed/);await assert.rejects(admin.query('delete from gp_member_paper_accounts'),/cannot be reset/);await assert.rejects(admin.query('truncate gp_member_paper_accounts'),/Append-only/);await assert.rejects(admin.query('update gp_member_paper_accounts set cash_lamports=10000000000'),/Restricted/);});
await test('stored retry lookup survives missing quotes and is member-scoped',async()=>{
 const id=randomUUID();const first=await fill(a,hashes[0],id);const lookup=await a.query("select gp_member_paper_request($1,$2,'BTC','buy',1000000000,null) result",[hashes[0],id]);assert.deepEqual(lookup.rows[0].result,first.rows[0].result);
 assert.equal((await a.query("select gp_member_paper_request($1,$2,'BTC','buy',1000000000,null) result",[hashes[2],id])).rows[0].result,null);
 await assert.rejects(a.query("select gp_member_paper_request($1,$2,'BTC','buy',2000000000,null)",[hashes[0],id]),/different order/);
});
await test('Solana ecosystem assets require exact provider IDs and costs lower net equity',async()=>{
 for(const [symbol,asset] of [['JUP','jupiter-exchange-solana'],['RAY','raydium']]){
 const obs=randomUUID();await publisher.query("insert into gp_member_price_observations(id,symbol,asset_id,source,token_microusd,sol_microusd,observed_at,sol_observed_at) values($1,$2,$3,'coingecko',500000,100000000,clock_timestamp(),clock_timestamp())",[obs,symbol,asset]);
 await a.query("select gp_member_record_paper_fill($1,$2,'buy',100000000,null,$3,$4)",[hashes[0],symbol,randomUUID(),obs]);
 }
 const w=(await a.query('select gp_member_workspace($1) w',[hashes[0]])).rows[0].w;
 assert.equal(w.valuation.available,true);assert.ok(BigInt(w.valuation.unrealizedLamports)<0n);assert.ok(w.history.length>1);assert.ok(w.fills.every(f=>f.id&&f.virtualLamports&&f.microUnits));
 await assert.rejects(publisher.query("insert into gp_member_price_observations(symbol,asset_id,source,token_microusd,sol_microusd,observed_at,sol_observed_at) values('JUP','bitcoin','coingecko',1,1,clock_timestamp(),clock_timestamp())"));
});
await test('closed ranking archives require boundary observations and cannot be forged by application',async()=>{
 await assert.rejects(a.query("select gp_member_freeze_rankings('daily',date_trunc('day',now()))"),/permission/);
 await assert.rejects(admin.query("select gp_member_freeze_rankings('daily',(date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')-interval '2 days')"),/boundary marks/);
 await admin.query("insert into gp_member_paper_rank_archives(period,start_at,end_at,rows) values('daily','2026-01-01Z','2026-01-02Z',$1)",[JSON.stringify([{memberId:members[0],handle:'historical_name',returnBps:'125'}])]);
 const archive=(await a.query("select gp_member_rank_archive('daily','2026-01-01Z') a")).rows[0].a;
 await a.query("select gp_sol_member_save($1,'new_public_name','',null,false,'New Name')",[hashes[0]]);
 assert.deepEqual((await a.query("select gp_member_rank_archive('daily','2026-01-01Z') a")).rows[0].a,archive);
 await assert.rejects(admin.query('delete from gp_member_paper_rank_archives'),/Append-only/);
 await assert.rejects(admin.query('truncate gp_member_paper_rank_archives'),/Append-only/);
 // Restore the synthetic identity before the pre-existing-row preservation check.
 const original=baseline.members.find(m=>m.id===members[0]);await admin.query('update gp_sol_members set username=$1,display_name=$2 where id=$3',[original.username,original.display_name,members[0]]);
});
await test('durable per-member order limit is serialized and does not block retries',async()=>{
 const q=await observation();const initial=(await admin.query("select count(*)::int n from gp_member_paper_fills where member_id=$1 and created_at>clock_timestamp()-interval '1 minute'",[members[2]])).rows[0].n;
 let last;for(let i=initial;i<30;i++){last=randomUUID();await fill(a,hashes[2],last,'1000000',q);}
 await assert.rejects(fill(a,hashes[2],randomUUID(),'1000000',q),/rate limit/);
 assert.equal((await fill(a,hashes[2],last,'1000000',q)).rows[0].result.virtual,true);
});
await test('private immutable history supports stable cursors and cannot cross members',async()=>{
 const page=(await a.query('select gp_member_paper_history($1,null,null) h',[hashes[0]])).rows[0].h;
 assert.ok(page.length>0);assert.ok(page.every(f=>f.id&&f.at&&f.microUnits&&f.virtualLamports));
 const cursor=page[0];const next=(await a.query('select gp_member_paper_history($1,$2,$3) h',[hashes[0],cursor.at,cursor.id])).rows[0].h;
 assert.ok(next.every(f=>f.id!==cursor.id));const other=(await a.query('select gp_member_paper_history($1,null,null) h',[hashes[2]])).rows[0].h;
 assert.ok(!other.some(f=>page.some(p=>p.id===f.id)));
 await assert.rejects(a.query('select gp_member_paper_history($1,null,null)',['f'.repeat(64)]),/Unauthorized/);
 await assert.rejects(a.query('select gp_member_paper_history($1,$2,null)',[hashes[0],cursor.at]),/cursor/);
});
await test('non-destructive production suspension preserves ledger and blocks writes',async()=>{
 const before=(await admin.query("select jsonb_agg(f order by f.id) data from gp_member_paper_fills f")).rows[0].data;
 await admin.query(readFileSync(root+'supabase/security/review/20261016_member_workspace_suspend_not_applied.sql','utf8'));
 assert.equal((await a.query('select gp_member_workspace($1) w',[hashes[0]])).rows[0].w.ready,false);
 await assert.rejects(fill(a,hashes[0]),/permission/);await assert.rejects(observation(),/permission/);
 assert.deepEqual((await admin.query("select jsonb_agg(f order by f.id) data from gp_member_paper_fills f")).rows[0].data,before);
 assert.equal((await a.query('select gp_sol_member_me($1) m',[hashes[0]])).rows[0].m.id,members[0]);
});
await test('migration and rollback preserve pre-existing gp_sol data and unrelated financial sentinel',async()=>{ // restore deliberate auth test mutations before comparing
await admin.query('update gp_sol_identities set banned=false');for(const row of baseline.sessions)await admin.query('update gp_sol_sessions set wallet_address=$2,created_at=$3,expires_at=$4,revoked_at=$5 where token_hash=$1',[row.token_hash,row.wallet_address,row.created_at,row.expires_at,row.revoked_at]);
await admin.query('create table financial_sentinel(id int primary key, amount bigint); insert into financial_sentinel values(1,123456789)');
await admin.query(readFileSync(root+'supabase/security/review/20261015_member_wallet_workspace_rollback.sql','utf8'));const after=(await admin.query("SELECT jsonb_build_object('identities',(SELECT jsonb_agg(i) FROM gp_sol_identities i WHERE wallet_address<>'99999999999999999999999999999999'),'sessions',(SELECT jsonb_agg(s) FROM gp_sol_sessions s),'members',(SELECT jsonb_agg(m) FROM gp_sol_members m WHERE wallet_address<>'99999999999999999999999999999999')) snapshot")).rows[0].snapshot;
// Row order is not semantically significant.
for(const key of Object.keys(baseline))assert.deepEqual(after[key].sort((x,y)=>JSON.stringify(x).localeCompare(JSON.stringify(y))),baseline[key].sort((x,y)=>JSON.stringify(x).localeCompare(JSON.stringify(y))));assert.equal((await admin.query('select amount::text from financial_sentinel')).rows[0].amount,'123456789');});
console.log(JSON.stringify({passed:results.length,results},null,2));
}catch(e){console.error(e);process.exitCode=1;}finally{for(const c of clients)await c.end().catch(()=>{});await cluster.stop().catch(()=>{});}
