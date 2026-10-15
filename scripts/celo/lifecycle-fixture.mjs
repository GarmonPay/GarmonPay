/** Local PostgreSQL fixture only; no production credentials or connections. */
import {PGlite} from '/private/tmp/garmonpay-phase1-db-validation/node_modules/@electric-sql/pglite/dist/index.js';
import {readFileSync} from 'node:fs';
export async function createLifecycleFixture(){
 const catalog=JSON.parse(readFileSync(process.env.CELO_CATALOG_PATH||new URL('./schema-fixture.json',import.meta.url),'utf8'));
 const db=new PGlite();
 const type=t=>t.startsWith('_')?type(t.slice(1))+'[]':({int4:'integer',int8:'bigint',bool:'boolean',float8:'double precision'}[t]||t);
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

return db;
}
