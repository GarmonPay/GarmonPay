import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {PGlite}=await import(process.env.SOL_FOUNDATION_PGLITE_MODULE||'@electric-sql/pglite');
const foundation=readFileSync('supabase/migrations/20261011010000_sol_foundation.sql','utf8');
const staging=readFileSync('supabase/security/staging/phase3-deposits.sql','utf8');
const rollback=readFileSync('supabase/security/staging/phase3-deposits-empty-rollback.sql','utf8');
async function database(){const db=new PGlite();await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;');await db.exec(foundation);await db.exec(staging);return db;}
const db=await database();
for(const role of ['anon','authenticated']){
 await db.exec(`SET ROLE ${role}`);
 await assert.rejects(db.query('SELECT * FROM gp_sol_deposit_reconciliation'),/permission denied/);
 await assert.rejects(db.query("SELECT gp_sol_post_verified_deposit(gen_random_uuid(),'g','s',0,1,now(),'s','d',1,true)"),/permission denied/);
 await db.exec('RESET ROLE');
}
await db.exec('SET ROLE service_role');
const actor='11111111111111111111111111111111',destination='22222222222222222222222222222222';
await db.query('INSERT INTO gp_sol_identities(wallet_address) VALUES($1)',[actor]);
const asset=(await db.query("INSERT INTO gp_sol_accounts(category,chain_wallet) VALUES('treasury_asset',$1) RETURNING id",[destination])).rows[0].id;
const liability=(await db.query("INSERT INTO gp_sol_accounts(category,owner_wallet) VALUES('member_liability',$1) RETURNING id",[actor])).rows[0].id;
const base=(await db.query("SELECT now()-interval '30 seconds' base")).rows[0].base;
const blockTime=new Date(new Date(base).getTime()+1000).toISOString();
async function intent(overrides={}){
 const row={source:actor,destination,amount:'100',treasury:asset,liability,...overrides};
 return (await db.query("INSERT INTO gp_sol_settlement_intents(actor_wallet,source_wallet,destination_wallet,genesis_hash,amount_lamports,minimum_slot,treasury_account,liability_account,authorization_reference,created_at,expires_at) VALUES($1,$2,$3,'synthetic-genesis',$4,100,$5,$6,'synthetic-approval',$7,$7::timestamptz+interval '5 minutes') RETURNING id",[actor,row.source,row.destination,row.amount,row.treasury,row.liability,base])).rows[0].id;
}
async function post(id,overrides={}){
 const p={genesis:'synthetic-genesis',signature:'1'.repeat(64),index:0,slot:101,blockTime,source:actor,destination,amount:'100',finalized:true,...overrides};
 return (await db.query('SELECT gp_sol_post_verified_deposit($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) id',[id,p.genesis,p.signature,p.index,p.slot,p.blockTime,p.source,p.destination,p.amount,p.finalized])).rows[0].id;
}
const first=await intent();
for(const change of [{amount:'101'},{source:destination},{genesis:'wrong'},{destination:actor},{slot:99},{finalized:false},{blockTime:new Date(new Date(base).getTime()-1000).toISOString()}])await assert.rejects(post(first,change),/authorization|evidence/);
const journal=await post(first);
assert.equal(await post(first),journal);
await assert.rejects(post(first,{signature:'2'.repeat(64)}),/replay/);
const repeated=await Promise.all(Array.from({length:12},()=>post(first)));
assert(repeated.every(id=>id===journal));
const second=await intent();
await assert.rejects(post(second),/duplicate key/);
assert.equal((await db.query('SELECT count(*)::int count FROM gp_sol_journals')).rows[0].count,1);
await assert.rejects(db.query('UPDATE gp_sol_settlement_receipts SET amount_lamports=200'),/permission denied|Immutable/);
await assert.rejects(db.query("UPDATE gp_sol_settlement_intents SET amount_lamports=200 WHERE id=$1",[second]),/immutable/);
// Inject a synthetic crash boundary after receipt insertion, before journal posting.
await db.exec('RESET ROLE');
await db.exec("CREATE FUNCTION synthetic_posting_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic posting failure'; END $$;CREATE TRIGGER synthetic_fail BEFORE INSERT ON gp_sol_journals FOR EACH ROW EXECUTE FUNCTION synthetic_posting_failure();SET ROLE service_role;");
await assert.rejects(post(second,{signature:'3'.repeat(64)}),/Synthetic posting failure/);
assert.equal((await db.query('SELECT count(*)::int count FROM gp_sol_settlement_receipts')).rows[0].count,1);
assert.equal((await db.query('SELECT status FROM gp_sol_settlement_intents WHERE id=$1',[second])).rows[0].status,'pending');
await db.exec('RESET ROLE;DROP TRIGGER synthetic_fail ON gp_sol_journals;DROP FUNCTION synthetic_posting_failure();SET ROLE service_role;');
await post(second,{signature:'3'.repeat(64)});
assert.deepEqual((await db.query('SELECT * FROM gp_sol_deposit_reconciliation')).rows[0],{receipt_count:'2',journal_count:'2',posted_intent_count:'2',orphan_journal_count:'0',mismatch_count:'0'});
await db.query("INSERT INTO gp_sol_journals(idempotency_key,event_type,debit_account,credit_account,amount_lamports) VALUES('synthetic-unmatched','gp_sol_deposit',$1,$2,1)",[asset,liability]);
assert.equal((await db.query('SELECT orphan_journal_count FROM gp_sol_deposit_reconciliation')).rows[0].orphan_journal_count,'1');
await db.exec('RESET ROLE');await assert.rejects(db.exec(rollback),/Rollback refused/);await db.exec('ROLLBACK');
assert.equal((await db.query('SELECT count(*)::int count FROM gp_sol_journals')).rows[0].count,3);
await db.close();
const empty=await database();await empty.exec(rollback);assert.equal((await empty.query("SELECT to_regclass('public.gp_sol_settlement_receipts') receipt")).rows[0].receipt,null);await empty.close();
console.log('Synthetic deposit posting passed: role isolation, exact authorization, finalized-evidence bounds, 12 repeat submissions, cross-intent receipt replay rejection, immutable history, atomic crash rollback/retry, reconciliation drift detection and empty/populated rollback. PGlite serializes requests; independent PostgreSQL concurrency and on-chain evidence are not certified.');
