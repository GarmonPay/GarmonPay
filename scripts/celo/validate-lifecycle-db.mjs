/** Runs actual production-shaped procedures in an isolated PostgreSQL fixture. Never connects to production. */
import {PGlite} from '/private/tmp/garmonpay-phase1-db-validation/node_modules/@electric-sql/pglite/dist/index.js';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const catalog=JSON.parse(readFileSync(process.env.CELO_CATALOG_PATH||new URL('./schema-fixture.json',import.meta.url),'utf8'));
const db=new PGlite();
const banker='00000000-0000-4000-8000-000000000001',player='00000000-0000-4000-8000-000000000002',other='00000000-0000-4000-8000-000000000003';
const type=t=>t.startsWith('_')?type(t.slice(1))+'[]':({int4:'integer',int8:'bigint',bool:'boolean',float8:'double precision'}[t]||t);
let checks=0;const check=(v,m)=>{assert(v,m);checks++;};
const query=async(sql,args=[])=> (await db.query(sql,args)).rows;
const action=async(user,room,mode,input={},request=crypto.randomUUID())=>(await query('SELECT celo_room_action_atomic($1,$2,$3,$4,$5) AS result',[user,room,mode,request,input]))[0].result;
const snapshot=async()=>({users:await query('SELECT id,gpay_coins FROM users ORDER BY id'),room:await query('SELECT id,current_bank_sc FROM celo_rooms'),ledger:await query('SELECT reference,gpay_coins FROM coin_transactions ORDER BY reference')});
const fails=async(fn,pattern)=>{const before=await snapshot();await assert.rejects(fn,pattern);assert.deepEqual(await snapshot(),before);checks++;};
const roll=async(user,room,round,dice,result,point=null,isCelo=false)=>{const request=crypto.randomUUID(),seq=(await query('SELECT roll_seq FROM celo_rounds WHERE id=$1',[round]))[0].roll_seq;
 await query('SELECT celo_claim_roll_atomic($1,$2,$3,$4,$5)',[user,room,round,request,seq]);
 const args=[user,room,round,request,dice,result,'Fixture '+result,point,isCelo];
 const response=(await query('SELECT celo_settle_roll_atomic($1,$2,$3,$4,$5,$6,$7,$8,$9) AS result',args))[0].result;
 const before=await snapshot();const replay=(await query('SELECT celo_settle_roll_atomic($1,$2,$3,$4,$5,$6,$7,$8,$9) AS result',args))[0].result;assert.deepEqual(await snapshot(),before);check(replay.idempotent,'payout replay is idempotent');return response;};
try{
 await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role; CREATE TABLE users(id uuid PRIMARY KEY,gpay_coins integer NOT NULL DEFAULT 0,gold_coins integer NOT NULL DEFAULT 0,gpay_tokens integer DEFAULT 0,lifetime_gc_purchased integer DEFAULT 0,lifetime_sc_earned integer DEFAULT 0,full_name text,username text,avatar_url text);CREATE TABLE coin_transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,type text,gold_coins integer,gpay_coins integer,description text,reference text UNIQUE);');
 for(const table of [...new Set(catalog.columns.filter(c=>c.table.startsWith('celo_')).map(c=>c.table))]){
  const columns=catalog.columns.filter(c=>c.table===table).map(c=>`"${c.column}" ${type(c.type)}${c.column==='id'?' PRIMARY KEY DEFAULT gen_random_uuid()': c.default && !c.default.includes('auth.')?' DEFAULT '+c.default:''}`);
  await db.exec(`CREATE TABLE "${table}" (${columns.join(',')});`);
 }
 for(const constraint of catalog.constraints??[])if(!constraint.definition.startsWith('PRIMARY KEY'))await db.exec(`ALTER TABLE "${constraint.table}" ADD CONSTRAINT "${constraint.name}" ${constraint.definition}`);
 await db.exec("CREATE TABLE platform_earnings(id uuid DEFAULT gen_random_uuid(),source text,source_id text,amount_cents integer,description text,user_id uuid,round_id uuid,fee_type text,idempotency_key text UNIQUE);CREATE TABLE fixture_fee_total(amount integer DEFAULT 0);INSERT INTO fixture_fee_total VALUES(0);CREATE FUNCTION platform_record_revenue(integer,text) RETURNS void LANGUAGE sql AS 'UPDATE fixture_fee_total SET amount=amount+$1';");
 for(const name of ['credit_coins','credit_coins_with_ledger','celo_next_free_player_seat','celo_handle_bank_bust_and_transfer','celo_record_platform_fee'])await db.exec(catalog.functions.find(f=>f.name===name).definition);
 await db.exec('GRANT ALL ON celo_rooms,celo_room_players,celo_rounds,celo_player_rolls,celo_side_bets TO anon,authenticated;');
 await db.exec(catalog.functions.find(f=>f.name==='celo_bump_room_total_rounds').definition);
 await db.exec('CREATE TRIGGER celo_rounds_bump_total_rounds AFTER UPDATE OF status ON celo_rounds FOR EACH ROW EXECUTE FUNCTION celo_bump_room_total_rounds();');
 await db.exec(readFileSync(new URL('../../supabase/migrations/20261005010000_celo_atomic_lifecycle.sql',import.meta.url),'utf8'));
 await db.exec(readFileSync(new URL('../../supabase/migrations/20261005010000_celo_atomic_lifecycle.sql',import.meta.url),'utf8'));
 await query('INSERT INTO users(id,gpay_coins) VALUES($1,10000),($2,10000),($3,0)',[banker,player,other]);
 const make=async()=>{const request=crypto.randomUUID(),settings={name:'Isolated lifecycle fixture',minimum_entry_sc:500,starting_bank_sc:2000,max_players:4};const a=await action(banker,null,'create',settings,request),before=await snapshot();const b=await action(banker,null,'create',settings,request);assert.deepEqual(await snapshot(),before);check(b.idempotent,'create retry no duplicate debit');return a.room.id;};
 let room=await make();await action(player,room,'join');check((await action(player,room,'join')).already_seated,'join retry retains seat');
 await fails(()=>action(other,room,'fund',{amount:500}),/Only the banker/);
 await fails(()=>action(banker,room,'start'),/posted entry/);
 await fails(()=>action(player,room,'entry',{amount:499}),/minimum/);
 await action(other,room,'join');await fails(()=>action(other,room,'entry',{amount:500}),/Insufficient GPC/);await action(other,room,'leave');
 const entryId=crypto.randomUUID();await action(player,room,'entry',{amount:500},entryId);const beforeEntry=await snapshot();check((await action(player,room,'entry',{amount:500},entryId)).idempotent,'entry retry idempotent');assert.deepEqual(await snapshot(),beforeEntry);
 await fails(()=>action(player,room,'entry',{amount:500}),/already posted/);
 await fails(()=>action(player,room,'start'),/Only the banker/);
 let start=await action(banker,room,'start'),round=start.round.id;const again=await action(banker,room,'start');check(again.round.id===round,'duplicate start returns same round');check((await query('SELECT count(*)::int AS n FROM celo_rounds WHERE room_id=$1',[room]))[0].n===1,'one round only');
 const claim=crypto.randomUUID();await query('SELECT celo_claim_roll_atomic($1,$2,$3,$4,0)',[banker,room,round,claim]);
 await fails(()=>query('SELECT celo_claim_roll_atomic($1,$2,$3,$4,0)',[banker,room,round,crypto.randomUUID()]),/already in progress/);
 await query('SELECT celo_settle_roll_atomic($1,$2,$3,$4,$5,$6,$7,$8,false)',[banker,room,round,claim,[2,2,4],'point','Point four',4]);
 check((await query('SELECT roller_user_id FROM celo_rounds WHERE id=$1',[round]))[0].roller_user_id===player,'server assigns funded player turn');
 const win=await roll(player,room,round,[4,5,6],'instant_win',null,true);check(win.roundComplete,'round resolves');check((await query('SELECT total_rounds FROM celo_rooms WHERE id=$1',[room]))[0].total_rounds===1,'existing completion trigger counts exactly once');check(win.payoutSc===950,'existing stake + net payout preserved');check(win.room.current_bank_sc===1500,'bank debited by matched stake');check((await query('SELECT stake_amount_sc,entry_posted FROM celo_room_players WHERE user_id=$1 AND room_id=$2',[player,room]))[0].entry_posted===false,'next-round entry reset');
 await action(player,room,'entry',{amount:500});const next=await action(banker,room,'start');check(next.round.round_number===2,'next round available');await roll(banker,room,next.round.id,[1,2,3],'instant_loss');
 await action(banker,room,'pause');await fails(()=>action(player,room,'entry',{amount:500}),/paused/);await action(banker,room,'resume');
 await action(player,room,'entry',{amount:500});await action(player,room,'leave');check((await query('SELECT count(*)::int AS n FROM celo_room_players WHERE room_id=$1 AND user_id=$2',[room,player]))[0].n===0,'player leaves and refunded');
 await action(banker,room,'delete');check((await query('SELECT current_bank_sc FROM celo_rooms WHERE id=$1',[room]))[0].current_bank_sc===0,'closing returns bank');
 room=await make();await action(player,room,'join');await action(player,room,'entry',{amount:500});start=await action(banker,room,'start');await roll(banker,room,start.round.id,[4,5,6],'instant_win',null,true);check((await query('SELECT current_bank_sc FROM celo_rooms WHERE id=$1',[room]))[0].current_bank_sc===2450,'banker win retained in escrow without duplicate wallet credit');await action(banker,room,'delete');
 room=await make();await action(player,room,'join');await action(player,room,'entry',{amount:500});start=await action(banker,room,'start');await roll(banker,room,start.round.id,[2,2,4],'point',4);const push=await roll(player,room,start.round.id,[3,3,4],'point',4);check(push.outcome==='push'&&push.payoutSc===500,'point tie refunds stake');await action(banker,room,'delete');
 // Failure injection proves a ledger error rolls back wallet, entry and room state together.
 room=await make();await action(player,room,'join');
 await db.exec("CREATE FUNCTION fixture_reject_ledger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Injected ledger failure'; END $$;CREATE TRIGGER fixture_reject BEFORE INSERT ON coin_transactions FOR EACH ROW EXECUTE FUNCTION fixture_reject_ledger();");
 await fails(()=>action(player,room,'entry',{amount:500}),/Injected ledger failure/);
 await db.exec('DROP TRIGGER fixture_reject ON coin_transactions;DROP FUNCTION fixture_reject_ledger();');
 const fundId=crypto.randomUUID();await action(banker,room,'fund',{amount:500},fundId);const fundedBefore=await snapshot();await action(banker,room,'fund',{amount:500},fundId);assert.deepEqual(await snapshot(),fundedBefore);check(true,'funding retries do not debit twice');
 await action(player,room,'entry',{amount:500});start=await action(banker,room,'start');
 await fails(()=>action(player,room,'leave'),/already in progress/);await fails(()=>action(banker,room,'delete'),/already in progress/);await fails(()=>action(banker,room,'pause'),/already in progress/);
 const pending=crypto.randomUUID(),payload={dice:[2,2,4],result:'point',rollName:'Point four',point:4,isCelo:false,isTrips:false};
 await query('SELECT celo_claim_roll_atomic($1,$2,$3,$4,0,false,$5)',[banker,room,start.round.id,pending,payload]);
 await fails(()=>query('SELECT celo_settle_roll_atomic($1,$2,$3,$4,$5,$6,$7,$8,false)',[banker,room,start.round.id,pending,[4,5,6],'instant_win','Wrong',null]),/differs/);
 await query('SELECT celo_settle_roll_atomic($1,$2,$3,$4,$5,$6,$7,$8,false)',[banker,room,start.round.id,pending,[2,2,4],'point','Point four',4]);
 await fails(()=>query('SELECT celo_claim_roll_atomic($1,$2,$3,$4,0)',[player,room,start.round.id,crypto.randomUUID()]),/Stale/);
 const snap=(await query('SELECT celo_room_snapshot($1,$2) AS result',[player,room]))[0].result;check(snap.activeRound.roller_user_id===player&&snap.players.length===2,'reconnect snapshot preserves committed turn and seats');
 await roll(player,room,start.round.id,[1,3,5],'no_count');check((await query('SELECT status FROM celo_rounds WHERE id=$1',[start.round.id]))[0].status==='player_rolling','no-count retains same funded player');
 await roll(player,room,start.round.id,[2,2,6],'instant_win');await action(banker,room,'delete');
 // Banker C-Lo allows a covered cashout, never disappearance of escrow.
 room=await make();await action(player,room,'join');await action(player,room,'entry',{amount:500});start=await action(banker,room,'start');await roll(banker,room,start.round.id,[4,5,6],'instant_win',null,true);
 const lowerId=crypto.randomUUID();await action(banker,room,'lower',{new_bank_sc:1500},lowerId);const loweredBefore=await snapshot();await action(banker,room,'lower',{new_bank_sc:1500},lowerId);assert.deepEqual(await snapshot(),loweredBefore);check(true,'lower bank refunds exact escrow once');await action(banker,room,'delete');
 // Side entry creation, acceptance and payout share settlement's transaction.
 room=await make();await action(player,room,'join');await action(player,room,'entry',{amount:500});start=await action(banker,room,'start');
 const sideId=crypto.randomUUID();const side=(await query('SELECT celo_sidebet_action_atomic($1,$2,$3,$4,$5) AS result',[banker,room,'create',sideId,{round_id:start.round.id,amount_sc:100,bet_type:'banker_wins'}]))[0].result.sideBet;
 const sideBefore=await snapshot();await query('SELECT celo_sidebet_action_atomic($1,$2,$3,$4,$5)',[banker,room,'create',sideId,{round_id:start.round.id,amount_sc:100,bet_type:'banker_wins'}]);assert.deepEqual(await snapshot(),sideBefore);check(true,'side entry retry no duplicate debit');
 await query('SELECT celo_sidebet_action_atomic($1,NULL,$2,$3,$4)',[player,'accept',crypto.randomUUID(),{bet_id:side.id}]);
 await roll(banker,room,start.round.id,[4,5,6],'instant_win',null,true);
 check((await query('SELECT status,payout_sc FROM celo_side_bets WHERE id=$1',[side.id]))[0].payout_sc===180,'side entry preserves 2-party pot and fee payout');await action(banker,room,'delete');
 // Pause cleanup returns entry and bank, charges only the existing capped abandonment fee.
 room=await make();await action(player,room,'join');await action(player,room,'entry',{amount:500});await action(banker,room,'pause');
 await query("UPDATE celo_rooms SET pause_expires_at=now()-interval '1 second' WHERE id=$1",[room]);
 const cleanup=(await query('SELECT celo_cleanup_room_atomic($1,true) AS result',[room]))[0].result;check(cleanup.ok&&cleanup.feeCharged===500,'expired banker pause charges established abandonment fee');
 const cleanBefore=await snapshot();await query('SELECT celo_cleanup_room_atomic($1,true)',[room]);assert.deepEqual(await snapshot(),cleanBefore);check(true,'pause cleanup retries do not repeat refunds or fee');
 // Forfeit uses the committed turn and leaves no invented dice.
 room=await make();await action(player,room,'join');await action(player,room,'entry',{amount:500});start=await action(banker,room,'start');await roll(banker,room,start.round.id,[2,2,4],'point',4);
 await query("UPDATE celo_rounds SET player_roll_deadline_at=now()-interval '1 second' WHERE id=$1",[start.round.id]);const timeoutId=crypto.randomUUID(),timeoutPayload={dice:null,result:'instant_loss',rollName:'TIMEOUT — FORFEIT',point:null,isCelo:false};
 await query('SELECT celo_claim_roll_atomic($1,$2,$3,$4,NULL,true,$5)',[banker,room,start.round.id,timeoutId,timeoutPayload]);
 const forfeit=(await query('SELECT celo_settle_roll_atomic($1,$2,$3,$4,NULL,$5,$6,NULL,false,true) AS result',[banker,room,start.round.id,timeoutId,'instant_loss','TIMEOUT — FORFEIT']))[0].result;
 check(forfeit.roundComplete&&forfeit.dice===null,'timeout settles loss without fabricated faces');
 const replayClaim=(await query('SELECT celo_claim_roll_atomic($1,$2,$3,$4,NULL,true,$5) AS result',[banker,room,start.round.id,timeoutId,timeoutPayload]))[0].result;check(replayClaim.replay.roundComplete,'final accepted roll replays after completion');await action(banker,room,'delete');
 // Bank bust assigns the actual winning player and permits atomic next-bank funding.
 room=(await action(banker,null,'create',{name:'Bust fixture',minimum_entry_sc:500,starting_bank_sc:500,max_players:4})).room.id;await action(player,room,'join');await action(player,room,'entry',{amount:500});start=await action(banker,room,'start');await roll(banker,room,start.round.id,[1,2,3],'instant_loss');
 const bust=(await query('SELECT banker_id,current_bank_sc FROM celo_rooms WHERE id=$1',[room]))[0];check(bust.banker_id===player&&bust.current_bank_sc===0,'bank bust assigns winning player at zero bank');
 const terminal=(await query('SELECT settlement_snapshot FROM celo_rounds WHERE id=$1',[start.round.id]))[0].settlement_snapshot;check(terminal.banker_id===banker&&terminal.winners[0].user_id===player,'winner identity survives banker role transfer');
 const setupId=crypto.randomUUID(),setupInput={name:'Next bank fixture',minimum_entry_sc:500,funding_amount_sc:1000,max_players:4};await action(player,room,'setup',setupInput,setupId);const setupBefore=await snapshot();await action(player,room,'setup',setupInput,setupId);assert.deepEqual(await snapshot(),setupBefore);check(true,'new-bank funding is atomic and retry safe');await action(player,room,'delete');
 // Recovery finishes a crashed server request using its accepted dice, without rerandomizing.
 room=await make();await action(player,room,'join');await action(player,room,'entry',{amount:500});start=await action(banker,room,'start');
 const lostRequest=crypto.randomUUID(),savedRoll={dice:[1,2,3],result:'instant_loss',rollName:'ACE-DEUCE-TREY • AUTOMATIC LOSS',point:null,isCelo:false,isTrips:false};
 await query('SELECT celo_claim_roll_atomic($1,$2,$3,$4,0,false,$5)',[banker,room,start.round.id,lostRequest,savedRoll]);
 check((await query('SELECT celo_recover_due_actions() AS result'))[0].result.processed===0,'fresh accepted request is not stolen by recovery');
 await query("UPDATE celo_rounds SET roll_animation_start_at=now()-interval '31 seconds' WHERE id=$1",[start.round.id]);
 const recovered=(await query('SELECT celo_recover_due_actions() AS result'))[0].result;check(recovered.processed===1&&recovered.errors===0,'crashed banker request recovers atomically');
 const accepted=(await query('SELECT last_roll_dice,status FROM celo_rounds WHERE id=$1',[start.round.id]))[0];check(accepted.status==='completed'&&accepted.last_roll_dice.join(',')==='1,2,3','recovery preserves the accepted server dice');
 const recoveredBefore=await snapshot();await query('SELECT celo_recover_due_actions()');assert.deepEqual(await snapshot(),recoveredBefore);check(true,'recovery repeats do not credit twice');await action(banker,room,'delete');
 room=await make();await action(player,room,'join');await action(player,room,'entry',{amount:500});start=await action(banker,room,'start');await roll(banker,room,start.round.id,[2,2,4],'point',4);
 await query("UPDATE celo_rounds SET player_roll_deadline_at=now()-interval '1 second' WHERE id=$1",[start.round.id]);
 const disconnected=(await query('SELECT celo_recover_due_actions() AS result'))[0].result;check(disconnected.processed===1&&disconnected.errors===0,'disconnected player forfeits through the same settlement procedure');await action(banker,room,'delete');
 const total=(await query('SELECT (SELECT sum(gpay_coins) FROM users)+(SELECT coalesce(sum(current_bank_sc),0) FROM celo_rooms)+(SELECT amount FROM fixture_fee_total) AS total'))[0].total;check(Number(total)===20000,'wallet + bank + fees conserve GPC');
 for(const role of ['anon','authenticated']){await db.exec('SET ROLE '+role);await assert.rejects(()=>query('SELECT celo_room_action_atomic($1,NULL,$2,$3,$4)',[banker,'create',crypto.randomUUID(),{}]),/permission denied/);await db.exec('RESET ROLE');checks++;}
 const writers=await query("SELECT proname,pronargs FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND proname IN('celo_wallet_move','celo_room_action_atomic','celo_claim_roll_atomic','celo_settle_roll_atomic','celo_sidebet_action_atomic','celo_settle_sidebets_atomic','celo_cleanup_room_atomic','celo_recover_due_actions','celo_handle_bank_bust_and_transfer','celo_record_platform_fee')");
 for(const role of ['anon','authenticated']){
  await db.exec('SET ROLE '+role);
  for(const f of writers){await assert.rejects(()=>query(`SELECT ${f.proname}(${Array(f.pronargs).fill('NULL').join(',')})`),/permission denied/);checks++;}
  for(const table of ['celo_rooms','celo_room_players','celo_rounds','celo_player_rolls','celo_side_bets']){await assert.rejects(()=>query(`DELETE FROM ${table}`),/permission denied/);checks++;}
  await db.exec('RESET ROLE');
 }
 console.log(`PASS ${checks} actual SQL lifecycle/accounting checks; isolated fixture only.`);
}finally{await db.close();}
