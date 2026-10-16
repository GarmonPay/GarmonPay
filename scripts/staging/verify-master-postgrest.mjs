import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const runtime = process.env.GARMONPAY_PG_RUNTIME;
if (!runtime) throw new Error("Set GARMONPAY_PG_RUNTIME to the isolated test runtime directory");
const root = process.cwd()+"/";
const require = createRequire(join(runtime, "package.json"));
const { default: EmbeddedPostgres } = await import(pathToFileURL(require.resolve("embedded-postgres")).href);
const pg = require("pg");
const port = 55454;
const apiPort = 55455;
const secret = "isolated-phase2-api-secret-not-a-production-key";
const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(ok ? "PASS" : "FAIL", name, detail);
}

function jwt(role) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify({
    role, iss: "isolated-review", aud: "authenticated",
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString("base64url");
  const sig = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

async function api(role, path, { method = "GET", body, prefer } = {}) {
  const token = role === "none" ? "" : role === "forged" ? jwt("gp_member_price_publisher").slice(0, -4) + "aaaa" : jwt(role);
  const headers = { apikey: jwt("anon"), "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (prefer) headers.prefer = prefer;
  const response = await fetch(`http://127.0.0.1:${apiPort}${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: response.status, json, text };
}

const cluster = new EmbeddedPostgres({
  databaseDir: join(mkdtempSync(join(tmpdir(), "gp-phase2-api-")), "data"),
  user: "postgres", password: "isolated-test-only", port, persistent: false, onLog: () => {}, onError: () => {},
});
let postgrest;
const clients = [];
try {
  await cluster.initialise();
  await cluster.start();
  const admin = new pg.Client({ host: "127.0.0.1", port, user: "postgres", password: "isolated-test-only", database: "postgres" });
  await admin.connect();
  clients.push(admin);
  await admin.query(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE ROLE authenticator NOINHERIT LOGIN PASSWORD 'isolated-test-only';
    GRANT anon, authenticated, service_role TO authenticator;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, authenticator;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
  `);
  for (const file of [
    "supabase/security/staging/phase1-wallet-identity.sql",
    "supabase/security/staging/phase3-session-rotation.sql",
    "supabase/security/phase1-review/supabase/migrations/20261012221843_phase1_03_members.sql",
    "supabase/security/phase1-review/supabase/migrations/20261014021340_members_private_by_default.sql",
    "supabase/security/production/20261014_member_display_referral.sql",
    "supabase/security/review/20261015_member_wallet_workspace.sql",
  ]) await admin.query(readFileSync(root + file, "utf8"));

  const version = (await admin.query("select version()")).rows[0].version;
  record("isolated database is not production", !/supabase\.co/.test(version), version.split(",")[0]);

  const wallets = ["A", "B", "C"].map((letter) => letter.repeat(32));
  const hashes = ["a", "b", "c"].map((letter) => letter.repeat(64));
  const members = [];
  for (let i = 0; i < wallets.length; i += 1) {
    const referral = i === 0 ? null : (await admin.query("select referral_code from gp_sol_members where id=$1", [members[0]])).rows[0].referral_code;
    members.push((await admin.query("select gp_sol_member_login($1,$2,now()+interval '30 minutes',null,$3) id", [wallets[i], hashes[i], referral])).rows[0].id);
  }
  const before = (await admin.query("select count(*)::int n from gp_sol_members")).rows[0].n;

  writeFileSync("/private/tmp/gp-master-postgrest.conf", `
db-uri = "postgres://authenticator:isolated-test-only@127.0.0.1:${port}/postgres"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "${secret}"
server-port = ${apiPort}
`);
  const probe = new pg.Client({ host: "127.0.0.1", port, user: "authenticator", password: "isolated-test-only", database: "postgres" });
  await probe.connect();
  clients.push(probe);
  console.log("authenticator", (await probe.query("select current_user, (select count(*)::int from pg_class where relname like 'gp_member_%') n")).rows[0]);
  postgrest = spawn(process.env.GARMONPAY_POSTGREST_BIN || "/private/tmp/gp-phase2-api/postgrest", ["/private/tmp/gp-master-postgrest.conf"], {
    env: { ...process.env, DYLD_LIBRARY_PATH: process.env.GARMONPAY_POSTGRES_LIB || "/private/tmp/gp-member-review-runtime/node_modules/@embedded-postgres/darwin-arm64/native/lib" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let ready = "";
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(ready || "PostgREST did not start")), 15000);
    const take = (chunk) => {
      ready += chunk.toString();
      if (ready.includes("Listening on port")) { clearTimeout(timer); resolve(); }
    };
    postgrest.stdout.on("data", take);
    postgrest.stderr.on("data", take);
    postgrest.on("exit", (code) => { if (!ready.includes("Listening on port")) { clearTimeout(timer); reject(new Error(`PostgREST exited ${code}: ${ready}`)); } });
  });

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const health = await api("anon", "/");
    if (health.status !== 503) break;
    if (attempt === 19) throw new Error(`PostgREST schema cache unavailable: ${health.text}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const fresh = () => ({
    id: randomUUID(), symbol: "BTC", asset_id: "bitcoin", source: "coingecko",
    token_microusd: "50000000000", sol_microusd: "100000000",
    observed_at: new Date().toISOString(), sol_observed_at: new Date().toISOString(),
  });

  const omitted = await api("gp_member_price_publisher", "/gp_member_price_observations", { method: "POST", body: fresh() });
  record("publisher insert with no return preference is accepted", omitted.status === 201 && omitted.text === "", `${omitted.status} body ${JSON.stringify(omitted.text)}`);
  const minimal = await api("gp_member_price_publisher", "/gp_member_price_observations", { method: "POST", body: fresh(), prefer: "return=minimal" });
  record("publisher can insert a fresh observation without reading it back", minimal.status === 201 && minimal.text === "", `${minimal.status} body ${JSON.stringify(minimal.text)}`);

  const represented = await api("gp_member_price_publisher", "/gp_member_price_observations", { method: "POST", body: fresh(), prefer: "return=representation" });
  record("publisher insert that asks for the row back is rejected", represented.status >= 400, `${represented.status} ${JSON.stringify(represented.json)?.slice(0, 180)}`);

  const readPrices = await api("gp_member_price_publisher", "/gp_member_price_observations");
  record("publisher cannot read price observations", readPrices.status >= 400 || (Array.isArray(readPrices.json) && readPrices.json.length === 0), String(readPrices.status));
  const readMembers = await api("gp_member_price_publisher", "/gp_sol_members");
  record("publisher cannot read member records", readMembers.status >= 400 || (Array.isArray(readMembers.json) && readMembers.json.length === 0), String(readMembers.status));
  const readSessions = await api("gp_member_price_publisher", "/gp_sol_sessions?select=token_hash,wallet_address");
  record("publisher cannot read session secrets", readSessions.status >= 400 || (Array.isArray(readSessions.json) && readSessions.json.length === 0), String(readSessions.status));

  for (const role of ["anon", "authenticated", "service_role"]) {
    const denied = await api(role, "/gp_member_price_observations", { method: "POST", body: fresh(), prefer: "return=minimal" });
    record(`${role} cannot publish prices`, denied.status >= 400, String(denied.status));
  }
  const forged = await api("forged", "/gp_member_price_observations", { method: "POST", body: fresh(), prefer: "return=minimal" });
  record("forged publisher signature is rejected", forged.status === 401, String(forged.status));

  const stale = fresh(); stale.observed_at = new Date(Date.now() - 120000).toISOString();
  const future = fresh(); future.observed_at = new Date(Date.now() + 120000).toISOString();
  const wrongAsset = fresh(); wrongAsset.asset_id = "dogecoin";
  const wrongSource = fresh(); wrongSource.source = "browser";
  const duplicate = fresh();
  for (const [name, body] of [["expired", stale], ["future", future], ["wrong asset", wrongAsset], ["forged source", wrongSource]]) {
    const response = await api("gp_member_price_publisher", "/gp_member_price_observations", { method: "POST", body, prefer: "return=minimal" });
    record(`publisher ${name} observation is rejected`, response.status >= 400, String(response.status));
  }
  const firstDup = await api("gp_member_price_publisher", "/gp_member_price_observations", { method: "POST", body: duplicate, prefer: "return=minimal" });
  const secondDup = await api("gp_member_price_publisher", "/gp_member_price_observations", { method: "POST", body: duplicate, prefer: "return=minimal" });
  record("duplicate observation id is rejected", firstDup.status === 201 && secondDup.status >= 400, `${firstDup.status}/${secondDup.status}`);
  const patched = await api("gp_member_price_publisher", `/gp_member_price_observations?id=eq.${duplicate.id}`, { method: "PATCH", body: { token_microusd: "1" }, prefer: "return=minimal" });
  record("publisher cannot modify an observation", patched.status >= 400, String(patched.status));

  for (const [path, body] of [
    ["/gp_member_paper_accounts", { member_id: members[0], cash_lamports: 10000000000 }],
    ["/gp_member_paper_fills", { member_id: members[0], symbol: "BTC", side: "buy", virtual_lamports: 1, micro_units: 1, price_microusd: 1, sol_price_microusd: 1, price_source: "coingecko", realized_lamports: 0, request_id: randomUUID(), observation_id: duplicate.id, request_payload: [], result: {} }],
    ["/gp_member_ranking_decisions", { member_id: members[0], eligible: true, reason: "Publisher tried to enroll itself" }],
    ["/gp_member_ad_drafts", { member_id: members[0], title: "Paid", destination_url: "https://example.com", tier: "seconds5", views: 1000, price_microusd: 9990000, status: "active", payment_enabled: true }],
  ]) {
    const response = await api("gp_member_price_publisher", path, { method: "POST", body, prefer: "return=minimal" });
    record(`publisher cannot write ${path}`, response.status >= 400, String(response.status));
  }
  const publisherFill = await api("gp_member_price_publisher", "/rpc/gp_member_record_paper_fill", {
    method: "POST", body: { p_hash: hashes[0], p_symbol: "BTC", p_side: "buy", p_spend_lamports: 1000000000, p_sell_micro_units: null, p_request_id: randomUUID(), p_observation_id: duplicate.id },
  });
  record("publisher cannot call the fill function", publisherFill.status >= 400, String(publisherFill.status));

  const serviceAccounts = await api("service_role", "/gp_member_paper_accounts", { method: "PATCH", body: { cash_lamports: 1 }, prefer: "return=minimal" });
  record("service role cannot edit paper balances", serviceAccounts.status >= 400, String(serviceAccounts.status));
  const anonFill = await api("anon", "/rpc/gp_member_record_paper_fill", { method: "POST", body: { p_hash: hashes[0] } });
  record("anonymous caller cannot fill", anonFill.status >= 400, String(anonFill.status));

  const quote = fresh();
  record("service fill setup observation", (await api("gp_member_price_publisher", "/gp_member_price_observations", { method: "POST", body: quote, prefer: "return=minimal" })).status === 201);
  const requestId = randomUUID();
  const fillBody = { p_hash: hashes[0], p_symbol: "BTC", p_side: "buy", p_spend_lamports: 1000000000, p_sell_micro_units: null, p_request_id: requestId, p_observation_id: quote.id };
  const firstFill = await api("service_role", "/rpc/gp_member_record_paper_fill", { method: "POST", body: fillBody });
  const retry = await api("service_role", "/rpc/gp_member_record_paper_fill", { method: "POST", body: fillBody });
  record("signed session fill succeeds and retry is idempotent", firstFill.status === 200 && firstFill.json?.virtual === true && JSON.stringify(firstFill.json) === JSON.stringify(retry.json), `${firstFill.status} ${JSON.stringify(firstFill.json)?.slice(0, 160)}`);
  const conflict = await api("service_role", "/rpc/gp_member_record_paper_fill", { method: "POST", body: { ...fillBody, p_spend_lamports: 2000000000 } });
  record("changed payload under the same request id is rejected", conflict.status >= 400, String(conflict.status));
  const cash = (await admin.query("select cash_lamports::text c from gp_member_paper_accounts where member_id=$1", [members[0]])).rows[0]?.c;
  record("idempotent retry debited once", cash === "9000000000", cash);
  const sellQuote = { ...fresh(), id: randomUUID(), token_microusd: "75000000000" };
  const sellPublished = await api("gp_member_price_publisher", "/gp_member_price_observations", { method: "POST", body: sellQuote, prefer: "return=minimal" });
  const sellRequest = randomUUID();
  const held=(await admin.query("select micro_units::text units from gp_member_paper_positions where member_id=$1 and symbol='BTC'",[members[0]])).rows[0].units;
  const gross=BigInt(held)*75000000000n*1000n/100000000n;
  const slipped=gross*9950n/10000n;
  const net=slipped-(slipped*175n+9999n)/10000n-5000n;
  const sellBody = { p_hash: hashes[0], p_symbol: "BTC", p_side: "sell", p_spend_lamports: null, p_sell_micro_units: Number(held), p_request_id: sellRequest, p_observation_id: sellQuote.id };
  const sell = await api("service_role", "/rpc/gp_member_record_paper_fill", { method: "POST", body: sellBody });
  const sellRetry = await api("service_role", "/rpc/gp_member_record_paper_fill", { method: "POST", body: sellBody });
  const afterSell = (await admin.query("select cash_lamports::text c from gp_member_paper_accounts where member_id=$1", [members[0]])).rows[0]?.c;
  const realized = (await admin.query("select realized_lamports::text r from gp_member_paper_fills where member_id=$1 and side='sell'", [members[0]])).rows[0]?.r;
  record("paper sell uses the stored observation and updates realized performance", sellPublished.status === 201 && sell.status === 200 && sell.json?.virtual === true && sell.json?.paymentEnabled === false && JSON.stringify(sell.json) === JSON.stringify(sellRetry.json) && afterSell === (9000000000n+net).toString() && realized === (net-1000000000n).toString(), `${sell.status} cash ${afterSell} realized ${realized}`);
  const fillId = (await admin.query("select id from gp_member_paper_fills where member_id=$1 and side='buy' limit 1", [members[0]])).rows[0].id;
  const changedFill = await api("service_role", `/gp_member_paper_fills?id=eq.${fillId}`, { method: "PATCH", body: { realized_lamports: 999 }, prefer: "return=minimal" });
  record("paper fills are immutable through the API", changedFill.status >= 400, String(changedFill.status));
  await admin.query("alter table gp_member_price_observations disable trigger immutable");
  await admin.query("update gp_member_price_observations set observed_at=now()-interval '2 minutes', sol_observed_at=now()-interval '2 minutes' where id=$1", [quote.id]);
  await admin.query("alter table gp_member_price_observations enable trigger immutable");
  const staleFill = await api("service_role", "/rpc/gp_member_record_paper_fill", { method: "POST", body: { ...fillBody, p_request_id: randomUUID() } });
  record("a backdated observation cannot price a new fill", staleFill.status >= 400, String(staleFill.status));

  const missing = await api("service_role", "/rpc/gp_member_record_paper_fill", { method: "POST", body: { ...fillBody, p_hash: "f".repeat(64), p_request_id: randomUUID() } });
  record("missing session is unauthorized", missing.status >= 400, String(missing.status));
  await admin.query("update gp_sol_sessions set created_at=now()-interval '30 minutes', expires_at=now()-interval '1 minute' where token_hash=$1", [hashes[1]]);
  const expired = await api("service_role", "/rpc/gp_member_workspace", { method: "POST", body: { p_hash: hashes[1] } });
  record("expired session is unauthorized", expired.status >= 400, String(expired.status));
  await admin.query("update gp_sol_sessions set expires_at=now()+interval '30 minutes' where token_hash=$1", [hashes[1]]);

  const workspace = await api("service_role", "/rpc/gp_member_workspace", { method: "POST", body: { p_hash: hashes[2] } });
  record("new paper account is exactly 10 virtual SOL", workspace.status === 200 && workspace.json?.cashLamports === "10000000000", String(workspace.json?.cashLamports));
  const isolatedQuote = fresh();
  await api("gp_member_price_publisher", "/gp_member_price_observations", { method: "POST", body: isolatedQuote, prefer: "return=minimal" });
  const cross = await api("service_role", "/rpc/gp_member_record_paper_fill", { method: "POST", body: { p_hash: hashes[0], p_symbol: "BTC", p_side: "buy", p_spend_lamports: 1000000000, p_sell_micro_units: null, p_request_id: randomUUID(), p_observation_id: isolatedQuote.id } });
  const untouched = (await admin.query("select cash_lamports::text c from gp_member_paper_accounts where member_id=$1", [members[2]])).rows[0].c;
  record("one member session cannot spend another member's virtual SOL", cross.status === 200 && untouched === "10000000000", `actor status ${cross.status}, other cash ${untouched}`);

  const quote2 = fresh();
  await api("gp_member_price_publisher", "/gp_member_price_observations", { method: "POST", body: quote2, prefer: "return=minimal" });
  const left = api("service_role", "/rpc/gp_member_record_paper_fill", { method: "POST", body: { p_hash: hashes[2], p_symbol: "BTC", p_side: "buy", p_spend_lamports: 7000000000, p_sell_micro_units: null, p_request_id: randomUUID(), p_observation_id: quote2.id } });
  const right = api("service_role", "/rpc/gp_member_record_paper_fill", { method: "POST", body: { p_hash: hashes[2], p_symbol: "BTC", p_side: "buy", p_spend_lamports: 7000000000, p_sell_micro_units: null, p_request_id: randomUUID(), p_observation_id: quote2.id } });
  const pair = await Promise.all([left, right]);
  const successes = pair.filter((item) => item.status === 200).length;
  const remaining = (await admin.query("select cash_lamports::text c from gp_member_paper_accounts where member_id=$1", [members[2]])).rows[0].c;
  record("concurrent overspend allows only one debit", successes === 1 && remaining === "3000000000", `${successes} success, cash ${remaining}`);

  const draft = await api("service_role", "/rpc/gp_member_save_ad_draft", { method: "POST", body: { p_hash: hashes[0], p_title: "Draft", p_url: "https://example.org", p_tier: "seconds5", p_views: 1000 } });
  const badViews = await api("service_role", "/rpc/gp_member_save_ad_draft", { method: "POST", body: { p_hash: hashes[0], p_title: "Draft", p_url: "https://example.org", p_tier: "seconds5", p_views: 501 } });
  const paid = await api("service_role", "/gp_member_ad_drafts", { method: "POST", body: { member_id: members[0], title: "Live", destination_url: "https://example.org", tier: "seconds5", views: 1000, price_microusd: 9990000, status: "active", payment_enabled: true }, prefer: "return=minimal" });
  const shown = await api("service_role", "/rpc/gp_member_workspace", { method: "POST", body: { p_hash: hashes[0] } });
  const draftRow = shown.json?.drafts?.[0];
  record("draft save stays unpaid and cannot activate a campaign", draft.status === 200 && badViews.status >= 400 && paid.status >= 400 && draftRow?.paymentEnabled === false && draftRow?.views === 1000, `${draft.status}/${badViews.status}/${paid.status}`);

  const rankings = await api("service_role", "/rpc/gp_member_paper_rankings", { method: "POST", body: { p_period: "daily" } });
  record("rankings stay empty until an operator decision", rankings.status === 200 && Array.isArray(rankings.json) && rankings.json.length === 0, JSON.stringify(rankings.json)?.slice(0, 80));
  const selfEnroll = await api("service_role", "/gp_member_ranking_decisions", { method: "POST", body: { member_id: members[0], eligible: true, reason: "Service role tried to enroll" }, prefer: "return=minimal" });
  record("service role cannot enroll a wallet in rankings", selfEnroll.status >= 400, String(selfEnroll.status));

  const grants = await admin.query(`
    select r.rolname, has_table_privilege(r.rolname, 'gp_member_price_observations', p.priv) allowed, p.priv
    from pg_roles r cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) p(priv)
    where r.rolname in ('anon','authenticated','service_role','gp_member_price_publisher')
  `);
  const publisherPrivs = Object.fromEntries(grants.rows.filter((row) => row.rolname === "gp_member_price_publisher").map((row) => [row.priv, row.allowed]));
  record("publisher privilege is insert only", publisherPrivs.INSERT === true && publisherPrivs.SELECT === false && publisherPrivs.UPDATE === false && publisherPrivs.DELETE === false, JSON.stringify(publisherPrivs));
  const withdrawalShape = await admin.query(`
    select
      (select count(*)::int from information_schema.columns where table_schema='public' and table_name like 'gp_member_%' and column_name ~* 'withdraw|payout|deposit|payment_intent') as columns,
      (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~* 'withdraw|payout|convert') as functions
  `);
  const withdrawCall = await api("service_role", "/rpc/gp_member_withdraw", { method: "POST", body: { p_hash: hashes[2] } });
  record("virtual SOL cannot be withdrawn or converted", withdrawalShape.rows[0].columns === 0 && withdrawalShape.rows[0].functions === 0 && withdrawCall.status === 404, JSON.stringify({ ...withdrawalShape.rows[0], status: withdrawCall.status }));
  const others = grants.rows.filter((row) => row.rolname !== "gp_member_price_publisher" && row.allowed);
  record("browser and service roles have no price-table privileges", others.length === 0, JSON.stringify(others));

  await admin.query(readFileSync(root + "supabase/security/review/20261015_member_wallet_workspace_rollback.sql", "utf8"));
  const afterMembers = (await admin.query("select count(*)::int n from gp_sol_members")).rows[0].n;
  const leftover = (await admin.query("select count(*)::int n from pg_class where relname like 'gp_member_%' and relkind='r'")).rows[0].n;
  record("rollback removes phase-2 tables and keeps member rows", afterMembers === before && leftover === 0, `members ${before}->${afterMembers}, tables ${leftover}`);
} catch (error) {
  console.error(error);
  record("harness", false, error instanceof Error ? error.message : String(error));
} finally {
  postgrest?.kill();
  for (const client of clients) await client.end().catch(() => {});
  await cluster.stop().catch(() => {});
}
const failed = results.filter((item) => !item.ok);
writeFileSync("/private/tmp/gp-master-postgrest-results.json", JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length }));
process.exitCode = failed.length ? 1 : 0;
