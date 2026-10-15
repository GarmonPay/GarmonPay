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
const server=new EmbeddedPostgres({databaseDir:join(directory,'db'),port:55439,user:'postgres',password:randomBytes(32).toString('hex'),authMethod:'scram-sha-256',persistent:false,createPostgresUser:false,postgresFlags:['-c','listen_addresses=127.0.0.1','-c',`unix_socket_directories=${directory}`],onLog:()=>{},onError:()=>{}});
const clients=[];
const evidence={runtime:'native PostgreSQL',syntheticOnly:true,productionAccess:false,checks:[]};
async function connect(){const client=server.getPgClient('postgres','127.0.0.1');await client.connect();clients.push(client);await client.query("SET statement_timeout='15s'");return client;}
try {
 await server.initialise();await server.start();
 const admin=await connect();
 assert.equal((await admin.query('SHOW listen_addresses')).rows[0].listen_addresses,'127.0.0.1');
 evidence.version=(await admin.query('SHOW server_version')).rows[0].server_version;
 await admin.query('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role');
 for(const path of ['supabase/migrations/20261011010000_sol_foundation.sql','supabase/security/staging/phase3-deposits.sql','supabase/security/staging/phase3-session-rotation.sql'])await admin.query(await readFile(path,'utf8'));
 const workers=await Promise.all(Array.from({length:12},()=>connect()));
 for(const client of workers)await client.query('SET ROLE service_role');
 const actor='11111111111111111111111111111111',destination='22222222222222222222222222222222';
 await admin.query('INSERT INTO gp_sol_identities(wallet_address) VALUES($1)',[actor]);
 const asset=(await admin.query("INSERT INTO gp_sol_accounts(category,chain_wallet) VALUES('treasury_asset',$1) RETURNING id",[destination])).rows[0].id;
 const liability=(await admin.query("INSERT INTO gp_sol_accounts(category,owner_wallet) VALUES('member_liability',$1) RETURNING id",[actor])).rows[0].id;
 const base=(await admin.query("SELECT now()-interval '10 seconds' base")).rows[0].base;
 const blockTime=new Date(base.getTime()+1000);
 async function intent(){return (await admin.query("INSERT INTO gp_sol_settlement_intents(actor_wallet,source_wallet,destination_wallet,genesis_hash,amount_lamports,minimum_slot,treasury_account,liability_account,authorization_reference,created_at,expires_at) VALUES($1,$1,$2,'synthetic-genesis',100,100,$3,$4,'synthetic-approval',$5,$5::timestamptz+interval '5 minutes') RETURNING id",[actor,destination,asset,liability,base])).rows[0].id;}
 const post=(client,id,signature)=>client.query('SELECT gp_sol_post_verified_deposit($1,$2,$3,0,101,$4,$5,$6,100,true) id',[id,'synthetic-genesis',signature,blockTime,actor,destination]);
 const first=await intent();
 // Hold the authorization row so all twelve independent backends queue together.
 await admin.query('BEGIN');await admin.query('SELECT id FROM gp_sol_settlement_intents WHERE id=$1 FOR UPDATE',[first]);
 const requests=workers.map(client=>post(client,first,'1'.repeat(64)));
 await admin.query('COMMIT');
 const result=await Promise.all(requests);
 assert.equal(new Set(result.map(r=>r.rows[0].id)).size,1);
 assert.equal((await admin.query('SELECT count(*)::int n FROM gp_sol_journals')).rows[0].n,1);
 evidence.checks.push('12 independent deposit requests produce exactly one journal');
 const other=await Promise.all([intent(),intent()]);
 const collision=await Promise.allSettled(other.map((id,i)=>post(workers[i],id,'2'.repeat(64))));
 assert.equal(collision.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(collision.filter(r=>r.status==='rejected'&&r.reason.code==='23505').length,1);
 const pending=other[collision.findIndex(r=>r.status==='rejected')];
 assert.equal((await admin.query('SELECT status FROM gp_sol_settlement_intents WHERE id=$1',[pending])).rows[0].status,'pending');
 await post(workers[2],pending,'3'.repeat(64));
 evidence.checks.push('Concurrent cross-intent receipt replay rejected; loser retries safely with distinct evidence');
 const challenge=(await workers[0].query("SELECT gp_sol_issue_challenge('synthetic-ip',$1,'syntheticnonce','synthetic-binding','synthetic message',now()+interval '5 minutes') id",[actor])).rows[0].id;
 await admin.query('BEGIN');await admin.query('SELECT id FROM gp_sol_challenges WHERE id=$1 FOR UPDATE',[challenge]);
 const consumes=workers.map(client=>client.query('SELECT * FROM gp_sol_consume_challenge($1,$2)',[challenge,'synthetic-binding']));
 await admin.query('COMMIT');
 assert.equal((await Promise.all(consumes)).reduce((n,r)=>n+r.rowCount,0),1);
 evidence.checks.push('12 independent nonce consumptions return exactly one challenge');
 const rate=await Promise.allSettled(workers.map((client,i)=>client.query("SELECT gp_sol_issue_challenge($1,$2,$3,'binding','message',now()+interval '5 minutes')",[`synthetic-ip-${i}`,destination,`syntheticnonce${i}`])));
 assert.equal(rate.filter(r=>r.status==='fulfilled').length,5);
 assert.equal(rate.filter(r=>r.status==='rejected'&&/rate limit/.test(r.reason.message)).length,7);
 evidence.checks.push('Independent IP requests obey the shared five-challenge wallet limit');
 const crashIntent=await intent();
 await admin.query("CREATE FUNCTION synthetic_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic failure'; END $$;CREATE TRIGGER synthetic_failure BEFORE INSERT ON gp_sol_journals FOR EACH ROW EXECUTE FUNCTION synthetic_failure()");
 await assert.rejects(post(workers[0],crashIntent,'4'.repeat(64)),/Synthetic failure/);
 assert.equal((await admin.query('SELECT count(*)::int n FROM gp_sol_settlement_receipts WHERE intent_id=$1',[crashIntent])).rows[0].n,0);
 assert.equal((await admin.query('SELECT status FROM gp_sol_settlement_intents WHERE id=$1',[crashIntent])).rows[0].status,'pending');
 await admin.query('DROP TRIGGER synthetic_failure ON gp_sol_journals;DROP FUNCTION synthetic_failure()');
 await post(workers[0],crashIntent,'4'.repeat(64));
 evidence.checks.push('Native posting failure rolls back receipt and authorization status; retry succeeds');
 const oldHash='a'.repeat(64),newHash='b'.repeat(64);
 await workers[0].query("SELECT gp_sol_create_session($1,$2,now()+interval '1 hour')",[actor,oldHash]);
 await assert.rejects(workers[0].query("SELECT gp_sol_rotate_session($1,$2,now()+interval '1 hour',$3)",[actor,oldHash,oldHash]),/duplicate key/);
 assert.equal((await admin.query('SELECT revoked_at FROM gp_sol_sessions WHERE token_hash=$1',[oldHash])).rows[0].revoked_at,null);
 await workers[0].query("SELECT gp_sol_rotate_session($1,$2,now()+interval '1 hour',$3)",[actor,newHash,oldHash]);
 assert.equal((await admin.query('SELECT count(*)::int n FROM gp_sol_sessions WHERE wallet_address=$1 AND revoked_at IS NULL',[actor])).rows[0].n,1);
 evidence.checks.push('Native session rotation preserves old session on failure and revokes it on successful replacement');
 const reconciliation=(await admin.query('SELECT * FROM gp_sol_deposit_reconciliation')).rows[0];
 assert.deepEqual(reconciliation,{receipt_count:'4',journal_count:'4',posted_intent_count:'4',orphan_journal_count:'0',mismatch_count:'0'});
 evidence.checks.push('Reconciliation remains exact after concurrent posting and retries');
 evidence.reconciliation=reconciliation;
 if(process.env.SOL_TEST_CAMPAIGN_LEDGER==='1') {
  const {verifyCampaignLedger}=await import('./verify-campaign-ledger.mjs');
  evidence.campaignLedger=await verifyCampaignLedger(admin,workers);
  evidence.checks.push('Receipt-backed campaign funding and atomic reward/referral journal integration passed');
 }
 if(process.env.SOL_TEST_VERIFIED_VIEWS==='1') {
  await admin.query(await readFile('supabase/security/staging/master-verified-views.sql','utf8'));
  const viewer='33333333333333333333333333333333',referrer='44444444444444444444444444444444';
  await admin.query('INSERT INTO gp_sol_identities(wallet_address) VALUES($1),($2)',[viewer,referrer]);
  await admin.query('INSERT INTO gp_sol_referrals(referee_wallet,referrer_wallet,verified_at) VALUES($1,$2,now())',[viewer,referrer]);
  const campaign=(await admin.query("INSERT INTO gp_sol_campaigns(advertiser_wallet,token_mint,package,moderation,status,reward_lamports,reserve_lamports,max_completions,allocation_approval_id,funding_signature,funding_verified_at) VALUES($1,'synthetic-mint','watch','approved','active',100,100,1,gen_random_uuid(),'synthetic-funding',now()) RETURNING id",[actor])).rows[0].id;
  await admin.query("INSERT INTO gp_sol_view_budgets(campaign_id,viewer_reserve,referral_reserve,reward_lamports,required_seconds,daily_limit,funding_reference) VALUES($1,100,50,100,15,10,'synthetic-funding')",[campaign]);
  const proof=(await admin.query("INSERT INTO gp_sol_view_proofs(campaign_id,viewer_wallet,started_at,expires_at,verifier_reference,verified_at,risk_approved) VALUES($1,$2,now()-interval '30 seconds',now()+interval '5 minutes','synthetic-view',now(),true) RETURNING id",[campaign,viewer])).rows[0].id;
  await assert.rejects(workers[0].query('SELECT gp_sol_claim_verified_view($1,$2)',[proof,actor]),/unavailable/);
  await admin.query('UPDATE gp_sol_view_proofs SET risk_approved=false WHERE id=$1',[proof]);
  await assert.rejects(workers[0].query('SELECT gp_sol_claim_verified_view($1,$2)',[proof,viewer]),/eligibility/);
  await admin.query('UPDATE gp_sol_view_proofs SET risk_approved=true,verified_at=started_at WHERE id=$1',[proof]);
  await assert.rejects(workers[0].query('SELECT gp_sol_claim_verified_view($1,$2)',[proof,viewer]),/viewing time/);
  await admin.query('UPDATE gp_sol_view_proofs SET verified_at=now() WHERE id=$1',[proof]);
  await admin.query('UPDATE gp_sol_view_budgets SET referral_reserve=0 WHERE campaign_id=$1',[campaign]);
  await assert.rejects(workers[0].query('SELECT gp_sol_claim_verified_view($1,$2)',[proof,viewer]),/funded obligations/);
  await admin.query('UPDATE gp_sol_view_budgets SET referral_reserve=50 WHERE campaign_id=$1',[campaign]);
  await admin.query("CREATE FUNCTION synthetic_award_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic award failure'; END $$;CREATE TRIGGER synthetic_award_failure BEFORE UPDATE ON gp_sol_view_budgets FOR EACH ROW EXECUTE FUNCTION synthetic_award_failure()");
  await assert.rejects(workers[0].query('SELECT gp_sol_claim_verified_view($1,$2)',[proof,viewer]),/Synthetic award failure/);
  assert.equal((await admin.query('SELECT count(*)::int n FROM gp_sol_view_awards')).rows[0].n,0);
  assert.equal((await admin.query('SELECT verified_completions FROM gp_sol_campaigns WHERE id=$1',[campaign])).rows[0].verified_completions,0);
  await admin.query('DROP TRIGGER synthetic_award_failure ON gp_sol_view_budgets;DROP FUNCTION synthetic_award_failure()');
  const claims=await Promise.all(workers.map(client=>client.query('SELECT gp_sol_claim_verified_view($1,$2) id',[proof,viewer])));
  assert(claims.every(r=>r.rows[0].id===proof));
  const awards=(await admin.query('SELECT * FROM gp_sol_view_awards')).rows;
  assert.equal(awards.length,1);assert.equal(awards[0].reward_lamports,'100');assert.equal(awards[0].referral_lamports,'50');
  assert.equal((await admin.query('SELECT status FROM gp_sol_campaigns WHERE id=$1',[campaign])).rows[0].status,'completed');
  assert.deepEqual((await admin.query('SELECT viewer_spent,referral_spent FROM gp_sol_view_budgets WHERE campaign_id=$1',[campaign])).rows[0],{viewer_spent:'100',referral_spent:'50'});
  for(let i=0;i<2;i++) {
   const odd=(await admin.query("INSERT INTO gp_sol_campaigns(advertiser_wallet,token_mint,package,moderation,status,reward_lamports,reserve_lamports,max_completions,allocation_approval_id,funding_signature,funding_verified_at) VALUES($1,'synthetic','watch','approved','active',3,3,1,gen_random_uuid(),$2,now()) RETURNING id",[actor,`odd-funding-${i}`])).rows[0].id;
   await admin.query("INSERT INTO gp_sol_view_budgets(campaign_id,viewer_reserve,referral_reserve,reward_lamports,required_seconds,daily_limit,funding_reference) VALUES($1,3,2,3,5,10,$2)",[odd,`odd-funding-${i}`]);
   const oddProof=(await admin.query("INSERT INTO gp_sol_view_proofs(campaign_id,viewer_wallet,started_at,expires_at,verifier_reference,verified_at,risk_approved) VALUES($1,$2,now()-interval '10 seconds',now()+interval '1 minute',$3,now(),true) RETURNING id",[odd,viewer,`odd-proof-${i}`])).rows[0].id;
   await workers[0].query('SELECT gp_sol_claim_verified_view($1,$2)',[oddProof,viewer]);
   assert.equal((await admin.query('SELECT referral_lamports FROM gp_sol_view_awards WHERE proof_id=$1',[oddProof])).rows[0].referral_lamports,String(i+1));
  }
  await assert.rejects(workers[0].query('DELETE FROM gp_sol_view_awards'),/permission denied/);
  await assert.rejects(admin.query(await readFile('supabase/security/staging/master-verified-views-empty-rollback.sql','utf8')),/Rollback refused/);
  await admin.query('ROLLBACK');
  for(const role of ['anon','authenticated']) {
   await admin.query(`SET ROLE ${role}`);
   await assert.rejects(admin.query('SELECT gp_sol_claim_verified_view($1,$2)',[proof,viewer]),/permission denied/);
   await admin.query('RESET ROLE');
  }
  evidence.checks.push('Verified views: ownership, fraud/timing, separate funding, crash rollback/retry, twelve concurrent idempotent claims, full viewer reward plus 50% match, completion, immutable awards, populated rollback protection and browser role denial');
 }
 evidence.passed=true;evidence.checkedAt=new Date().toISOString();
 await writeFile(process.env.SOL_TEST_CAMPAIGN_LEDGER==='1'?'docs/solana/master-campaign-ledger-tests.json':process.env.SOL_TEST_VERIFIED_VIEWS==='1'?'docs/solana/master-verified-views-tests.json':'docs/solana/phase3-native-concurrency.json',JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify(evidence,null,2));
} finally {
 await Promise.allSettled(clients.map(client=>client.end()));
 await server.stop();
}
