import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { PGlite } = await import(process.env.SOL_FOUNDATION_PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const tables = ['backup_transactions_clean','backup_transactions_clean_v2','backup_transactions','backup_users','backup_transactions_full','backup_profiles_balance_fix','recovered_stripe_sessions'];
const views = ['admin_finance_overview','admin_stats','total_deposits'];
await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;');
for (const t of tables) await db.exec(`CREATE TABLE public.${t}(id integer); INSERT INTO public.${t} VALUES(42); GRANT ALL ON public.${t} TO anon,authenticated,service_role;`);
for (const v of views) await db.exec(`CREATE VIEW public.${v} AS SELECT * FROM public.backup_transactions; GRANT ALL ON public.${v} TO anon,authenticated,service_role;`);
await db.exec(readFileSync('supabase/migrations/20261011200724_restrict_legacy_audit_exposure.sql','utf8'));
for (const role of ['anon','authenticated']) {
  for (const object of [...tables,...views]) {
    for (const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) assert.equal((await db.query('SELECT has_table_privilege($1,$2,$3) AS ok',[role,object,privilege])).rows[0].ok,false);
    await db.exec(`SET ROLE ${role}`);
    await assert.rejects(db.query(`SELECT * FROM public.${object}`),/permission denied/);
    await db.exec('RESET ROLE');
  }
}
await db.exec('SET ROLE service_role');
for (const t of tables) assert.deepEqual((await db.query(`SELECT * FROM public.${t}`)).rows,[{id:42}]);
await db.exec('RESET ROLE');
await db.exec(readFileSync('supabase/security/legacy-audit-exposure-rollback.sql','utf8'));
for (const t of tables) assert.equal((await db.query('SELECT relrowsecurity FROM pg_class WHERE relname=$1',[t])).rows[0].relrowsecurity,false);
for (const o of [...tables,...views]) assert.equal((await db.query("SELECT has_table_privilege('anon',$1,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS ok",[o])).rows[0].ok,true);
await db.close();
console.log('Permission migration and rollback passed: browser roles denied, trusted server access preserved, all synthetic rows unchanged.');
