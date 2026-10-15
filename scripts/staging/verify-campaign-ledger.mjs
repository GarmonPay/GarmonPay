import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
export async function verifyCampaignLedger(admin,workers){
 for(const file of ['master-verified-views.sql','master-campaign-ledger.sql'])await admin.query(await readFile(`supabase/security/staging/${file}`,'utf8'));
 const advertiser='55555555555555555555555555555555',viewer='66666666666666666666666666666666',referrer='77777777777777777777777777777777',destination='88888888888888888888888888888888';
 await admin.query('INSERT INTO gp_sol_identities(wallet_address) VALUES($1),($2),($3)',[advertiser,viewer,referrer]);
 const asset=(await admin.query("INSERT INTO gp_sol_accounts(category,chain_wallet) VALUES('treasury_asset',$1) RETURNING id",[destination])).rows[0].id;
 const liability=(await admin.query("INSERT INTO gp_sol_accounts(category,owner_wallet) VALUES('member_liability',$1) RETURNING id",[advertiser])).rows[0].id;
 const intent=(await admin.query("INSERT INTO gp_sol_settlement_intents(actor_wallet,source_wallet,destination_wallet,genesis_hash,amount_lamports,minimum_slot,treasury_account,liability_account,authorization_reference,created_at,expires_at) VALUES($1,$1,$2,'synthetic',800000,1,$3,$4,'synthetic-approved-purchase',now()-interval '10 seconds',now()+interval '4 minutes') RETURNING id",[advertiser,destination,asset,liability])).rows[0].id;
 await workers[0].query("SELECT gp_sol_post_verified_deposit($1,'synthetic',$2,0,2,now()-interval '1 second',$3,$4,800000,true)",[intent,'5'.repeat(64),advertiser,destination]);
 const receipt=(await admin.query('SELECT id FROM gp_sol_settlement_receipts WHERE intent_id=$1',[intent])).rows[0].id;
 const campaign=(await admin.query("INSERT INTO gp_sol_campaigns(advertiser_wallet,token_mint,package,moderation,max_completions) VALUES($1,'synthetic','watch','approved',1000) RETURNING id",[advertiser])).rows[0].id;
 await admin.query("INSERT INTO gp_sol_campaign_quotes VALUES($1,'approved-v1',15,1000,8000000,10000000000,800000,100,now()-interval '10 seconds',now()+interval '50 seconds')",[campaign]);
 await assert.rejects(workers[0].query('SELECT gp_sol_fund_campaign($1,gen_random_uuid(),100,15,10)',[campaign]),/receipt/);
 // Node 24 strips this module's types; no project package changes or build needed.
 const serviceModule=process.env.SOL_CAMPAIGN_SERVICE_MODULE||new URL('../../src/lib/solana/campaign-service.ts',import.meta.url).href;
 const {fundSessionCampaign,claimSessionView}=await import(serviceModule);
 const store=client=>({
  async getApprovedQuote(id,wallet){const result=await client.query('SELECT q.reward_lamports,q.seconds,10 AS daily_limit FROM gp_sol_campaign_quotes q JOIN gp_sol_campaigns c ON c.id=q.campaign_id WHERE c.id=$1 AND c.advertiser_wallet=$2',[id,wallet]);return {data:result.rows[0]??null,error:null};},
  async fundCampaign(p){try{const r=await client.query('SELECT gp_sol_fund_campaign($1,$2,$3,$4,$5) id',[p.p_campaign,p.p_receipt,p.p_reward,p.p_seconds,p.p_daily_limit]);return {data:r.rows[0].id,error:null};}catch(error){return {data:null,error};}},
  async claimView(p){try{const r=await client.query('SELECT gp_sol_claim_verified_view($1,$2) id',[p.p_proof,p.p_viewer]);return {data:r.rows[0].id,error:null};}catch(error){return {data:null,error};}},
 });
 await assert.rejects(fundSessionCampaign(store(workers[0]),{wallet:viewer},{campaignId:campaign,receiptId:receipt}),/Owned/);
 const funds=await Promise.all(workers.map(async c=>({rows:[{id:(await fundSessionCampaign(store(c),{wallet:advertiser},{campaignId:campaign,receiptId:receipt})).campaignId}]})));
 assert(funds.every(r=>r.rows[0].id===campaign));
 assert.equal((await admin.query('SELECT gp_sol_account_balance($1) balance',[liability])).rows[0].balance,'650000');
 assert.equal((await admin.query("SELECT count(*)::int n FROM gp_sol_journals WHERE event_type='campaign_funding'")).rows[0].n,2);
 await assert.rejects(workers[0].query('SELECT gp_sol_fund_campaign($1,$2,101,15,10)',[campaign,receipt]),/replay/);
 const other=(await admin.query("INSERT INTO gp_sol_campaigns(advertiser_wallet,token_mint,package,moderation,max_completions) VALUES($1,'synthetic','watch','approved',1000) RETURNING id",[advertiser])).rows[0].id;
 await admin.query("INSERT INTO gp_sol_campaign_quotes VALUES($1,'approved-v1',15,1000,8000000,10000000000,800000,100,now()-interval '10 seconds',now()+interval '50 seconds')",[other]);
 await assert.rejects(workers[0].query('SELECT gp_sol_fund_campaign($1,$2,100,15,10)',[other,receipt]),/duplicate key/);
 await admin.query('INSERT INTO gp_sol_referrals(referee_wallet,referrer_wallet,verified_at) VALUES($1,$2,now())',[viewer,referrer]);
 const proof=(await admin.query("INSERT INTO gp_sol_view_proofs(campaign_id,viewer_wallet,started_at,expires_at,verifier_reference,verified_at,risk_approved) VALUES($1,$2,now()-interval '30 seconds',now()+interval '5 minutes','integrated-synthetic-proof',now(),true) RETURNING id",[campaign,viewer])).rows[0].id;
 // Failure at the last write must roll back both new liabilities and journals.
 await admin.query("CREATE FUNCTION integrated_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Integrated crash'; END $$;CREATE TRIGGER integrated_failure BEFORE UPDATE ON gp_sol_campaigns FOR EACH ROW EXECUTE FUNCTION integrated_failure()");
 await assert.rejects(workers[0].query('SELECT gp_sol_claim_verified_view($1,$2)',[proof,viewer]),/Integrated crash/);
 assert.equal((await admin.query('SELECT count(*)::int n FROM gp_sol_view_awards')).rows[0].n,0);
 assert.equal((await admin.query("SELECT count(*)::int n FROM gp_sol_journals WHERE event_type IN('verified_view_reward','viewer_referral_match')")).rows[0].n,0);
 await admin.query('DROP TRIGGER integrated_failure ON gp_sol_campaigns;DROP FUNCTION integrated_failure()');
 await Promise.all(workers.map(c=>claimSessionView(store(c),{wallet:viewer},proof)));
 const balances=(await admin.query("SELECT owner_wallet,gp_sol_account_balance(id) balance FROM gp_sol_accounts WHERE owner_wallet IN($1,$2) ORDER BY owner_wallet",[viewer,referrer])).rows;
 assert.deepEqual(balances,[{owner_wallet:viewer,balance:'100'},{owner_wallet:referrer,balance:'50'}]);
 const budget=(await admin.query('SELECT gp_sol_account_balance(viewer_account) viewer,gp_sol_account_balance(referral_account) referral,viewer_spent,referral_spent FROM gp_sol_view_budgets WHERE campaign_id=$1',[campaign])).rows[0];
 assert.deepEqual(budget,{viewer:'99900',referral:'49950',viewer_spent:'100',referral_spent:'50'});
 assert.equal((await admin.query("SELECT count(*)::int n FROM gp_sol_journals WHERE event_type IN('verified_view_reward','viewer_referral_match')")).rows[0].n,2);
 for(const role of ['anon','authenticated']){
  await admin.query(`SET ROLE ${role}`);
  await assert.rejects(admin.query('SELECT gp_sol_fund_campaign($1,$2,100,15,10)',[campaign,receipt]),/permission denied/);
  await admin.query('RESET ROLE');
 }
 await admin.query(await readFile('supabase/security/staging/master-withdrawal-reservation.sql','utf8'));
 const observed=(await admin.query('SELECT now() at')).rows[0].at;
 const reserve=(client,key,gross)=>client.query('SELECT gp_sol_reserve_withdrawal($1,$2,$3,0,10000000000,$4) id',[advertiser,key,gross,observed]);
 await assert.rejects(reserve(workers[0],'below_minimum',199999),/\$2/);
 const withdrawals=await Promise.all(workers.map(c=>reserve(c,'same_withdrawal',200000)));
 assert.equal(new Set(withdrawals.map(r=>r.rows[0].id)).size,1);
 assert.equal((await admin.query('SELECT gp_sol_account_balance($1) balance',[liability])).rows[0].balance,'450000');
 const races=await Promise.allSettled([reserve(workers[0],'race_a',300000),reserve(workers[1],'race_b',300000)]);
 assert.equal(races.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(races.filter(r=>r.status==='rejected'&&/Insufficient/.test(r.reason.message)).length,1);
 assert.equal((await admin.query('SELECT gp_sol_account_balance($1) balance',[liability])).rows[0].balance,'150000');
 await assert.rejects(reserve(workers[0],'same_withdrawal',200001),/replay/);
 assert.equal((await admin.query('SELECT count(*)::int n FROM gp_sol_withdrawal_reservations')).rows[0].n,2);
 await admin.query(await readFile('supabase/security/staging/master-learning-ledger.sql','utf8'));
 await admin.query("INSERT INTO gp_sol_identities(wallet_address) VALUES('99999999999999999999999999999999')");
 await admin.query("INSERT INTO gp_sol_referrals(referee_wallet,referrer_wallet,verified_at) VALUES($1,'99999999999999999999999999999999',now())",[referrer]);
 const learnIntent=(await admin.query("INSERT INTO gp_sol_settlement_intents(actor_wallet,source_wallet,destination_wallet,genesis_hash,amount_lamports,minimum_slot,treasury_account,liability_account,authorization_reference,created_at,expires_at) VALUES($1,$1,$2,'synthetic',800000,1,$3,$4,'synthetic-learning-purchase',now()-interval '10 seconds',now()+interval '4 minutes') RETURNING id",[advertiser,destination,asset,liability])).rows[0].id;
 await workers[0].query("SELECT gp_sol_post_verified_deposit($1,'synthetic',$2,0,2,now()-interval '1 second',$3,$4,800000,true)",[learnIntent,'6'.repeat(64),advertiser,destination]);
 const learnReceipt=(await admin.query('SELECT id FROM gp_sol_settlement_receipts WHERE intent_id=$1',[learnIntent])).rows[0].id;
 const learnCampaign=(await admin.query("INSERT INTO gp_sol_campaigns(advertiser_wallet,token_mint,package,moderation,max_completions) VALUES($1,'synthetic','learn','approved',1000) RETURNING id",[advertiser])).rows[0].id;
 await admin.query("INSERT INTO gp_sol_campaign_quotes VALUES($1,'approved-v1',15,1000,8000000,10000000000,800000,100,now()-interval '10 seconds',now()+interval '50 seconds')",[learnCampaign]);
 await workers[0].query('SELECT gp_sol_fund_campaign($1,$2,100,15,10)',[learnCampaign,learnReceipt]);
 const learnProof=(await admin.query("INSERT INTO gp_sol_view_proofs(campaign_id,viewer_wallet,started_at,expires_at,verifier_reference,verified_at,risk_approved) VALUES($1,$2,now()-interval '30 seconds',now()+interval '5 minutes','synthetic-learning-proof',now(),true) RETURNING id",[learnCampaign,referrer])).rows[0].id;
 await assert.rejects(workers[0].query('SELECT gp_sol_claim_verified_view($1,$2)',[learnProof,referrer]),/lesson completion/);
 await admin.query("INSERT INTO gp_sol_lessons VALUES('wallet_safety','v1',30,2,10000,true)");
 await admin.query("INSERT INTO gp_sol_learning_completions(proof_id,lesson_id,lesson_version,viewer_wallet,correct_answers,video_verified_seconds,verifier_reference) VALUES($1,'wallet_safety','v1',$2,2,30,'server-quiz-attestation')",[learnProof,referrer]);
 await Promise.all(workers.map(c=>c.query('SELECT gp_sol_claim_verified_view($1,$2)',[learnProof,referrer])));
 assert.equal((await admin.query("SELECT count(*)::int n FROM gp_sol_journals WHERE idempotency_key=$1",['view:'+learnProof])).rows[0].n,1);
 assert.equal((await admin.query('SELECT referral_lamports FROM gp_sol_view_awards WHERE proof_id=$1',[learnProof])).rows[0].referral_lamports,'0');
 await assert.rejects(admin.query("INSERT INTO gp_sol_learning_completions(proof_id,lesson_id,lesson_version,viewer_wallet,correct_answers,video_verified_seconds,verifier_reference) VALUES($1,'wallet_safety','v1',$2,2,30,'duplicate-completion')",[proof,referrer]),/duplicate key/);
 await assert.rejects(admin.query("UPDATE gp_sol_campaigns SET package='learn' WHERE id=$1",[campaign]),/immutable/);
 await assert.rejects(admin.query('UPDATE gp_sol_view_budgets SET reward_lamports=1 WHERE campaign_id=$1',[campaign]),/immutable/);
 assert((await workers[0].query('SELECT reconciled FROM gp_sol_campaign_reconciliation')).rows.every(r=>r.reconciled));
 await admin.query('UPDATE gp_sol_view_budgets SET viewer_spent=viewer_spent+1 WHERE campaign_id=$1',[campaign]);
 assert.equal((await workers[0].query('SELECT reconciled FROM gp_sol_campaign_reconciliation WHERE campaign_id=$1',[campaign])).rows[0].reconciled,false);
 await admin.query('UPDATE gp_sol_view_budgets SET viewer_spent=viewer_spent-1 WHERE campaign_id=$1',[campaign]);
 return {campaignFunding:'12 concurrent submissions, one receipt-backed allocation',rewardLedger:'12 concurrent claims, one viewer journal and one separately funded referral journal',crashRecovery:'all awards, journals, liabilities and counters rolled back before safe retry',balances,remainingReserves:budget,learning:'No reward without versioned verified completion; twelve claims post one funded journal; duplicate lesson completion denied',withdrawals:'$2 threshold, twelve idempotent reservations, competing spend rejection and exact replay binding; no transaction signed or sent'};
}
