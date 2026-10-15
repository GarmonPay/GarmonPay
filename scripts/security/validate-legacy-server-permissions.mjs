import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { PGlite } = await import(process.env.SOL_FOUNDATION_PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const sensitive=['arena_daily_spin','arena_referral_bonus','arena_activity_log','daily_profit_summary','games_rewards','arena_model_queue','advertiser_campaigns','classified_campaigns'];
const catalog=['arena_weight_classes','packages','gc_packages'];
await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;');
for(const t of [...sensitive,...catalog])await db.exec(`CREATE TABLE ${t}(id integer); INSERT INTO ${t} VALUES(42); GRANT ALL ON ${t} TO anon,authenticated,service_role;`);
await db.exec(readFileSync('supabase/migrations/20261011200920_protect_legacy_server_tables.sql','utf8'));
for(const role of ['anon','authenticated']){
 await db.exec(`SET ROLE ${role}`);
 for(const t of sensitive)await assert.rejects(db.query(`SELECT * FROM ${t}`),/permission denied/);
 for(const t of catalog)assert.deepEqual((await db.query(`SELECT * FROM ${t}`)).rows,[{id:42}]);
 for(const t of [...sensitive,...catalog]){
  await assert.rejects(db.query(`UPDATE ${t} SET id=0`),/permission denied/);
  await assert.rejects(db.query(`TRUNCATE ${t}`),/permission denied/);
 }
 await db.exec('RESET ROLE');
}
await db.exec('SET ROLE service_role');
for(const t of [...sensitive,...catalog]){
 assert.deepEqual((await db.query(`SELECT * FROM ${t}`)).rows,[{id:42}]);
 await db.exec(`UPDATE ${t} SET id=43`);
}
await db.exec('RESET ROLE');
await db.exec(readFileSync('supabase/security/legacy-server-tables-rollback.sql','utf8'));
await db.exec('SET ROLE anon');
for(const t of [...sensitive,...catalog])assert.deepEqual((await db.query(`SELECT * FROM ${t}`)).rows,[{id:43}]);
await db.close();
console.log('11-table permission migration and rollback passed: private data denied, catalogs readable, all client writes denied, trusted server operations preserved.');
