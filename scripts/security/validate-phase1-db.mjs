/** Empty, in-memory PostgreSQL grant validation. Never connects to Supabase.
 * Install @electric-sql/pglite in a temporary directory, then set
 * PHASE1_PGLITE_MODULE to its absolute dist/index.js path. No project dependency needed.
 */
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const modulePath = process.env.PHASE1_PGLITE_MODULE;
if (!modulePath) throw new Error('Set PHASE1_PGLITE_MODULE to the temporary PGlite module path');
const { PGlite } = await import(pathToFileURL(modulePath).href);
const db = new PGlite();
const migration = readFileSync(new URL('../../supabase/migrations/20261003180000_phase1_security_authorization.sql', import.meta.url), 'utf8');
const list = migration.match(/protected_functions text\[\] := ARRAY\[([\s\S]*?)\];/)[1];
const names = [...list.matchAll(/'([a-z_][a-z0-9_]*)'/g)].map(m => m[1]);
assert(names.includes('purchase_membership_with_balance_v2'));
assert(names.includes('garmon_margin_last_24h'));
const protectedColumns = ['balance', 'balance_cents', 'gold_coins', 'gpay_coins', 'gpay_tokens', 'sweeps_coins', 'arena_coins', 'ad_credit_balance', 'total_deposits', 'total_withdrawn', 'role', 'is_super_admin', 'membership', 'membership_tier', 'membership_expires_at', 'membership_payment_source', 'stripe_subscription_id', 'referral_code', 'referred_by_code', 'banned'];
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE public.users (id uuid PRIMARY KEY, full_name text, avatar_url text, ${protectedColumns.map(c => `${c} text`).join(', ')});
    GRANT ALL ON public.users TO PUBLIC, anon, authenticated;
    GRANT UPDATE (gpay_coins, role), INSERT (balance, is_super_admin) ON public.users TO PUBLIC, anon, authenticated;
    ${names.map(n => `CREATE FUNCTION public.${n}() RETURNS integer LANGUAGE sql SECURITY DEFINER AS 'SELECT 1'; GRANT EXECUTE ON FUNCTION public.${n}() TO anon, authenticated;`).join('\n')}
    CREATE FUNCTION public.credit_coins(integer) RETURNS integer LANGUAGE sql SECURITY DEFINER AS 'SELECT 1';
    GRANT EXECUTE ON FUNCTION public.credit_coins(integer) TO anon, authenticated;
    CREATE FUNCTION public.change_username(text) RETURNS integer LANGUAGE sql AS 'SELECT 1';
    REVOKE EXECUTE ON FUNCTION public.change_username(text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.change_username(text) TO authenticated;
    CREATE FUNCTION public.garmondrop_cancel_room(uuid) RETURNS integer LANGUAGE sql AS 'SELECT 1';
    REVOKE EXECUTE ON FUNCTION public.garmondrop_cancel_room(uuid) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION public.garmondrop_cancel_room(uuid) TO authenticated;`);
  await db.exec(migration);
  await db.exec(migration); // Idempotency.
  let denied = 0;
  for (const role of ['anon', 'authenticated']) {
    for (const name of names) {
      await db.exec(`SET ROLE ${role}`);
      await assert.rejects(db.query(`SELECT public.${name}()`), /permission denied for function/);
      denied++;
      await db.exec('RESET ROLE');
    }
    await db.exec(`SET ROLE ${role}`);
    await assert.rejects(db.query('SELECT public.credit_coins(1)'), /permission denied for function/);
    await db.exec('RESET ROLE');
    for (const column of protectedColumns) {
      const grants = (await db.query(`SELECT has_column_privilege($1, 'public.users', $2, 'UPDATE') AS update_ok,
        has_column_privilege($1, 'public.users', $2, 'INSERT') AS insert_ok`, [role, column])).rows[0];
      assert.equal(grants.update_ok, false, `${role} UPDATE ${column}`);
      assert.equal(grants.insert_ok, false, `${role} INSERT ${column}`);
    }
    await db.exec(`SET ROLE ${role}`);
    await assert.rejects(db.query("UPDATE public.users SET gpay_coins = '999' WHERE false"), /permission denied/);
    await assert.rejects(db.query("UPDATE public.users SET role = 'super_admin' WHERE false"), /permission denied/);
    await assert.rejects(db.query('DELETE FROM public.users WHERE false'), /permission denied/);
    await db.exec('RESET ROLE');
  }
  await db.exec('SET ROLE service_role');
  for (const name of names) assert.equal((await db.query(`SELECT public.${name}() AS result`)).rows[0].result, 1);
  await db.exec('RESET ROLE; SET ROLE authenticated');
  await db.query("UPDATE public.users SET full_name = 'Profile' WHERE false");
  assert.equal((await db.query("SELECT public.change_username('profile') AS result")).rows[0].result, 1);
  assert.equal((await db.query("SELECT public.garmondrop_cancel_room(NULL) AS result")).rows[0].result, 1);
  await db.exec('RESET ROLE');
  assert.equal((await db.query('SELECT count(*)::int AS total FROM public.users')).rows[0].total, 0);
  console.log(`PASS: ${names.length} financial function names + overload denied to anon/authenticated (${denied + 2} denied calls); service_role allowed; ${protectedColumns.length} protected columns locked; profile/guarded client RPC grants preserved; migration idempotent. Empty fixture only: no balances or production schema modified.`);
} finally { await db.close(); }

// Optional catalog-shaped fixture: real identifiers/signatures, no production bodies or rows.
if (process.env.PHASE1_CATALOG_PATH) {
  const catalog = JSON.parse(readFileSync(process.env.PHASE1_CATALOG_PATH, 'utf8'));
  const fixture = new PGlite();
  const quote = value => '"' + value.replaceAll('"', '""') + '"';
  const functions = catalog.functions.filter(f => names.includes(f.name));
  try {
    await fixture.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.users (${catalog.columns.map(c => quote(c.name) + ' text').join(', ')});
      GRANT ALL ON public.users TO anon, authenticated, service_role;`);
    for (const f of functions) {
      await fixture.exec(`CREATE FUNCTION public.${quote(f.name)}(${f.arguments}) RETURNS integer LANGUAGE sql SECURITY DEFINER AS 'SELECT 1';
        GRANT EXECUTE ON FUNCTION ${f.signature} TO anon, authenticated, service_role;`);
    }
    await fixture.exec(migration);
    await fixture.exec(migration);
    let denied = 0;
    for (const f of functions) {
      for (const role of ['anon', 'authenticated', 'service_role']) {
        const result = await fixture.query("SELECT has_function_privilege($1, $2, 'EXECUTE') AS allowed", [role, f.signature]);
        assert.equal(result.rows[0].allowed, role === 'service_role', `${role}: ${f.signature}`);
        if (role !== 'service_role') denied++;
      }
    }
    for (const column of catalog.columns) {
      for (const role of ['anon', 'authenticated']) {
        const result = await fixture.query("SELECT has_column_privilege($1, 'public.users', $2, 'UPDATE') AS allowed", [role, column.name]);
        assert.equal(result.rows[0].allowed, role === 'authenticated' && ['full_name', 'avatar_url'].includes(column.name));
      }
    }
    assert.equal((await fixture.query('SELECT count(*)::int AS total FROM public.users')).rows[0].total, 0);
    console.log(`PASS: production catalog fixture: ${functions.length} real signatures, ${denied} denied role/signature combinations, ${catalog.columns.length} column grants verified; migration idempotent. No live function bodies executed.`);
  } finally { await fixture.close(); }
}
