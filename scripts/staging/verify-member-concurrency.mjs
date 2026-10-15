// Synthetic, disposable loopback PostgreSQL only. No project/production credentials.
import assert from 'node:assert/strict';
import {readFile, mkdtemp, writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const runtime=process.env.SOL_NATIVE_POSTGRES_MODULE;
if (!runtime) throw new Error('Set SOL_NATIVE_POSTGRES_MODULE to the temporary embedded-postgres module');
const {default: EmbeddedPostgres}=await import(runtime);
const directory=await mkdtemp(join(tmpdir(),'garmonpay-synthetic-pg-'));
const server=new EmbeddedPostgres({databaseDir:join(directory,'db'),port:55440,user:'postgres',password:randomBytes(32).toString('hex'),authMethod:'scram-sha-256',persistent:false,createPostgresUser:false,postgresFlags:['-c','listen_addresses=127.0.0.1','-c',`unix_socket_directories=${directory}`],onLog:()=>{},onError:()=>{}});
const clients=[];
const evidence={runtime:'native PostgreSQL',syntheticOnly:true,productionAccess:false,checks:[]};
async function connect(){const client=server.getPgClient('postgres','127.0.0.1');await client.connect();clients.push(client);await client.query("SET statement_timeout='15s'");return client;}
try {
 await server.initialise();await server.start();const admin=await connect();
 assert.equal((await admin.query('SHOW listen_addresses')).rows[0].listen_addresses,'127.0.0.1');
 await admin.query('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;GRANT USAGE ON SCHEMA public TO service_role');
 await admin.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role');
 for(const path of ['supabase/security/staging/phase1-wallet-identity.sql','supabase/security/staging/phase3-session-rotation.sql','supabase/security/staging/phase1-members.sql'])await admin.query(await readFile(path,'utf8'));
 const workers=await Promise.all(Array.from({length:12},()=>connect()));for(const worker of workers)await worker.query('SET ROLE service_role');
 const wallet='11111111111111111111111111111111';
 const ids=await Promise.all(workers.map((worker,i)=>worker.query("SELECT gp_sol_member_login($1,$2,now()+interval '30 minutes',null,null) id",[wallet,i.toString(16).padStart(64,'0')])));
 assert.equal(new Set(ids.map(result=>result.rows[0].id)).size,1);
 assert.equal((await admin.query('SELECT count(*)::int n FROM gp_sol_members')).rows[0].n,1);
 evidence.checks.push('12 independent wallet logins retain exactly one permanent account');
 const parent=ids[0].rows[0].id;
 const other='22222222222222222222222222222222';
 const child=(await workers[0].query("SELECT gp_sol_member_login($1,$2,now()+interval '30 minutes',null,null) id",[other,'f'.repeat(64)])).rows[0].id;
 const claims=await Promise.allSettled([workers[0].query("SELECT gp_sol_member_save($1,'shared_name','',null,true)",['0'.repeat(64)]),workers[1].query("SELECT gp_sol_member_save($1,'shared_name','',null,true)",['f'.repeat(64)])]);
 assert.equal(claims.filter(result=>result.status==='fulfilled').length,1);assert.equal(claims.filter(result=>result.status==='rejected'&&result.reason.code==='23505').length,1);
 evidence.checks.push('Concurrent unique username claims have exactly one winner');
 await Promise.all(workers.map(worker=>worker.query('SELECT gp_sol_member_follow($1,$2,true)',['f'.repeat(64),parent])));
 assert.equal((await admin.query('SELECT count(*)::int n FROM gp_sol_member_follows WHERE follower=$1 AND followed=$2',[child,parent])).rows[0].n,1);
 evidence.checks.push('12 concurrent follows create one relationship');
 await workers[0].query('SELECT gp_sol_member_save($1,$2,$3,$4,false)',['f'.repeat(64),'rollback_member','Preserve this biography','data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6YAAAAABJRU5ErkJggg==']);
 const snapshot=async()=> (await admin.query(`SELECT jsonb_build_object('members',(SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM gp_sol_members m),'follows',(SELECT jsonb_agg(to_jsonb(f) ORDER BY follower,followed) FROM gp_sol_member_follows f),'identities',(SELECT jsonb_agg(to_jsonb(i) ORDER BY wallet_address) FROM gp_sol_identities i)) data`)).rows[0].data;
 const before=await snapshot();
 const grants=async()=> (await admin.query("SELECT tablename,tableowner,rowsecurity,(SELECT jsonb_agg(jsonb_build_object('role',r,'privilege',p,'allowed',has_table_privilege(r, 'public.'||tablename,p)) ORDER BY r,p) FROM unnest(ARRAY['anon','authenticated','service_role']) r CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p) privileges FROM pg_tables WHERE schemaname='public' AND tablename=ANY($1) ORDER BY tablename",[['gp_sol_identities','gp_sol_challenges','gp_sol_sessions','gp_sol_members','gp_sol_member_follows']])).rows;
 const originalGrants=await grants();assert.equal(originalGrants.length,5);
 for(const table of originalGrants){assert.equal(table.rowsecurity,true);for(const privilege of table.privileges)if(privilege.role!=='service_role')assert.equal(privilege.allowed,false);}
 assert.equal((await admin.query("SELECT has_table_privilege('service_role','public.gp_sol_members','DELETE') allowed")).rows[0].allowed,false);
 await admin.query(await readFile('supabase/security/phase1-review/hold-access.sql','utf8'));
 for(const sql of ['SELECT * FROM gp_sol_members',"SELECT gp_sol_member_me('"+'f'.repeat(64)+"')"]){await assert.rejects(workers[0].query(sql),error=>error.code==='42501');}
 assert.deepEqual(await snapshot(),before);
 await admin.query(await readFile('supabase/security/phase1-review/restore-access.sql','utf8'));
 assert.deepEqual(await grants(),originalGrants);
 for(const table of await grants())for(const privilege of table.privileges){
  const allowed=privilege.role==='service_role' && (['SELECT','INSERT'].includes(privilege.privilege)||privilege.privilege==='UPDATE'&&table.tablename!=='gp_sol_member_follows'||privilege.privilege==='DELETE'&&table.tablename!=='gp_sol_members');
  assert.equal(privilege.allowed,allowed);
 }
 assert.equal((await workers[0].query('SELECT gp_sol_member_me($1) data',['f'.repeat(64)])).rows[0].data.id,child);
 assert.deepEqual(await snapshot(),before);
 for(const role of ['anon','authenticated']){
  await admin.query('SET ROLE '+role);
  await assert.rejects(admin.query('SELECT * FROM gp_sol_members'),error=>error.code==='42501');
  await assert.rejects(admin.query("SELECT gp_sol_member_directory(null,null,null)"),error=>error.code==='42501');
  await admin.query('RESET ROLE');
 }
 assert.equal((await admin.query("SELECT has_table_privilege('service_role','public.gp_sol_members','DELETE') allowed")).rows[0].allowed,false);
 evidence.checks.push('Access hold denies server reads/RPC; restore preserves exact accounts, profiles, identities and follow rows; browser roles stay denied and account deletion remains denied');
 if(process.env.MEMBER_CONCURRENCY_OUTPUT)await writeFile(process.env.MEMBER_CONCURRENCY_OUTPUT,JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify(evidence,null,2));
} finally {await Promise.allSettled(clients.map(client=>client.end()));await server.stop();}
