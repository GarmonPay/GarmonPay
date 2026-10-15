import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { PGlite } = await import(process.env.SOL_FOUNDATION_PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const tables = ['ad_packages', 'cpu_fighters'];
await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;');
for (const table of tables) {
  await db.exec(`CREATE TABLE ${table}(id int PRIMARY KEY, is_active boolean NOT NULL); INSERT INTO ${table} VALUES(1,true),(2,false); ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY; GRANT ALL ON ${table} TO anon,authenticated,service_role;`);
  // Current policy behavior: CPU catalog is public; ad_packages has no browser
  // policies and its public HTTP catalog is served by the trusted backend.
  if(table==='cpu_fighters') await db.exec(`CREATE POLICY catalog ON ${table} FOR SELECT TO anon,authenticated USING(true); CREATE POLICY server_access ON ${table} FOR ALL TO service_role USING(true) WITH CHECK(true);`);
}
async function snapshot() {
  return (await db.query(`SELECT c.relname,r.role,p.privilege,has_table_privilege(r.role,c.oid,p.privilege) allowed FROM pg_class c CROSS JOIN (VALUES('anon'),('authenticated'),('service_role'))r(role) CROSS JOIN (VALUES('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'))p(privilege) WHERE c.relnamespace='public'::regnamespace AND c.relkind='r' ORDER BY 1,2,3`)).rows;
}
const before = await snapshot();
await db.exec(readFileSync('supabase/security/proposals/phase2-catalog-ddl.sql','utf8'));
const after = await snapshot();
for (let i=0;i<before.length;i++) {
  const record=before[i];
  if(record.role==='service_role'||['SELECT','INSERT','UPDATE','DELETE'].includes(record.privilege)) assert.deepEqual(after[i],record);
  else assert.equal(after[i].allowed,false);
}
for(const role of ['anon','authenticated']) {
  await db.exec(`SET ROLE ${role}`);
  for(const table of tables) {
    assert.deepEqual((await db.query(`SELECT id FROM ${table} ORDER BY id`)).rows,table==='cpu_fighters'?[{id:1},{id:2}]:[]);
    assert.deepEqual((await db.query(`UPDATE ${table} SET is_active=false RETURNING id`)).rows,[]);
    await assert.rejects(db.query(`TRUNCATE ${table}`),/permission denied/);
  }
  await db.exec('RESET ROLE');
}
await db.exec('SET ROLE service_role');
for(const table of tables) {
  assert.equal((await db.query(`SELECT * FROM ${table}`)).rows.length,2);
  await db.exec(`INSERT INTO ${table} VALUES(3,true); UPDATE ${table} SET is_active=false WHERE id=3; DELETE FROM ${table} WHERE id=3;`);
}
await db.exec('RESET ROLE');
await db.exec(readFileSync('supabase/security/phase2-catalog-ddl-rollback.sql','utf8'));
assert.deepEqual(await snapshot(),before);
for(const table of tables)assert.deepEqual((await db.query(`SELECT * FROM ${table} ORDER BY id`)).rows,[{id:1,is_active:true},{id:2,is_active:false}]);
await db.close();
console.log('Focused two-catalog proposal: 42 role/privilege checks, RLS catalog reads, denied client writes, service CRUD and exact rollback passed. Synthetic data only; no production migration applied.');
