import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const runtime=process.env.GARMONPAY_PG_RUNTIME;
if(!runtime) throw new Error('Set GARMONPAY_PG_RUNTIME to the isolated test runtime directory containing package.json; no production database URL is accepted.');
const require=createRequire(resolve(runtime,'package.json'));
const {default:EmbeddedPostgres}=await import(pathToFileURL(require.resolve('embedded-postgres')).href);
const pg=require('pg');
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const root=process.cwd()+'/';const results=[];const clients=[];
const cluster=new EmbeddedPostgres({databaseDir:'/private/tmp/gp-master-username-data',user:'postgres',password:'isolated-only',port:55447,persistent:false,onLog:()=>{},onError:()=>{}});
async function test(name,fn){await fn();results.push(name);console.log('PASS',name);}
try{
await cluster.initialise();await cluster.start();
async function connect(role){const c=new pg.Client({host:'127.0.0.1',port:55447,user:'postgres',password:'isolated-only',database:'postgres'});await c.connect();clients.push(c);if(role)await c.query('SET ROLE '+role);return c;}
const admin=await connect();await admin.query('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; GRANT USAGE ON SCHEMA public TO service_role;');
for(const f of ['supabase/security/staging/phase1-wallet-identity.sql','supabase/security/staging/phase3-session-rotation.sql','supabase/security/staging/phase1-members.sql'])await admin.query(readFileSync(root+f,'utf8'));
const a=await connect('service_role'),b=await connect('service_role');const hashes=['a','b','c'].map(x=>x.repeat(64));const ids=[];
for(let i=0;i<3;i++)ids.push((await a.query("select gp_sol_member_login($1,$2,now()+interval '30 minutes',null,$3) id",[String(i+1).repeat(32),hashes[i],null])).rows[0].id);
const before=(await admin.query('select id,wallet_address,username,referral_code,referral_slug,referred_by from gp_sol_members order by id')).rows;
await test('transactional migration preserves all existing usernames and identities',async()=>{await admin.query(readFileSync(root+'supabase/security/review/20261016_username_cooldown_not_applied.sql','utf8'));assert.deepEqual((await admin.query('select id,wallet_address,username,referral_code,referral_slug,referred_by from gp_sol_members order by id')).rows,before);});
const save=(c,h,name,bio='')=>c.query("select gp_sol_member_save($1,$2,$3,null,false,'Test Member')",[h,name,bio]);
await test('first rename and timestamp commit atomically',async()=>{await save(a,hashes[0],'royal_one');const row=(await admin.query('select username,username_changed_at from gp_sol_members where id=$1',[ids[0]])).rows[0];assert.equal(row.username,'royal_one');assert.ok(row.username_changed_at);});
await test('second rename rejected without changing previous profile',async()=>{await assert.rejects(save(a,hashes[0],'royal_two','changed'),/seven|after/);assert.equal((await admin.query('select biography from gp_sol_members where id=$1',[ids[0]])).rows[0].biography,'');});
await test('same username permits ordinary profile update without resetting cooldown',async()=>{const before=(await admin.query('select username_changed_at from gp_sol_members where id=$1',[ids[0]])).rows[0];await save(a,hashes[0],'royal_one','Biography');assert.deepEqual((await admin.query('select username_changed_at from gp_sol_members where id=$1',[ids[0]])).rows[0],before);});
await test('direct privileged rename and cooldown rewrite cannot bypass trigger',async()=>{await assert.rejects(a.query("update gp_sol_members set username='bypass' where id=$1",[ids[0]]),/seven/);await assert.rejects(a.query('update gp_sol_members set username_changed_at=null where id=$1',[ids[0]]),/history/);});
await test('two independent connections competing for same account allow one rename',async()=>{assert.notEqual((await a.query('select pg_backend_pid() pid')).rows[0].pid,(await b.query('select pg_backend_pid() pid')).rows[0].pid);await a.query('begin');await save(a,hashes[1],'concurrent_one');const pending=assert.rejects(save(b,hashes[1],'concurrent_two'),/seven|after/);await new Promise(r=>setTimeout(r,100));await a.query('commit');await pending;});
await test('unique username constraint rejects another member and rolls back timestamp',async()=>{await assert.rejects(save(a,hashes[2],'royal_one'),/unique/);assert.equal((await admin.query('select username_changed_at from gp_sol_members where id=$1',[ids[2]])).rows[0].username_changed_at,null);});
await test('invalid biography rolls back all profile fields',async()=>{await assert.rejects(save(a,hashes[2],'valid_name','x'.repeat(281)));assert.equal((await admin.query('select username_changed_at from gp_sol_members where id=$1',[ids[2]])).rows[0].username_changed_at,null);});
await test('anonymous and authenticated cannot execute profile or policy RPC',async()=>{for(const role of ['anon','authenticated']){const c=await connect(role);await assert.rejects(save(c,hashes[2],'no_access'),/permission/);await assert.rejects(c.query('select gp_sol_username_policy()'),/permission/);}});
await test('revoked session waiting on account lock is rejected after lock release',async()=>{await a.query('begin');await a.query('select id from gp_sol_members where id=$1 for update',[ids[2]]);const pending=assert.rejects(save(b,hashes[2],'revoked_name'),/Unauthorized/);await new Promise(r=>setTimeout(r,100));await admin.query('update gp_sol_sessions set revoked_at=clock_timestamp() where token_hash=$1',[hashes[2]]);await a.query('commit');await pending;});
await test('wallets, immutable IDs and referral attribution remain unchanged',async()=>{const rows=(await admin.query('select id,wallet_address,referral_code,referral_slug,referred_by from gp_sol_members order by id')).rows;assert.deepEqual(rows,before.map(({username,...row})=>row));});
await test('rollback retains usernames/history and removes capability without deleting records',async()=>{const before=(await admin.query('select * from gp_sol_members order by id')).rows;await admin.query(readFileSync(root+'supabase/security/review/20261016_username_cooldown_rollback_not_applied.sql','utf8'));assert.deepEqual((await admin.query('select * from gp_sol_members order by id')).rows,before);await assert.rejects(a.query('select gp_sol_username_policy()'),/does not exist/);});
writeFileSync('/private/tmp/gp-master-username-results.json',JSON.stringify({passed:results.length,results},null,2));
}catch(e){console.error(e);process.exitCode=1;}finally{for(const c of clients)await c.end().catch(()=>{});await cluster.stop().catch(()=>{});}
