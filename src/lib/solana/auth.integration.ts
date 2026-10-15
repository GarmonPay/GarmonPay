import { readFileSync } from "node:fs";
import { generateKeyPairSync, sign } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const boundary = vi.hoisted(() => ({ jar: new Map<string, string>(), db: null as any }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (key: string) => boundary.jar.has(key) ? { value: boundary.jar.get(key) } : undefined, set: (key: string, value: string) => boundary.jar.set(key, value), delete: (key: string) => boundary.jar.delete(key) }) }));
vi.mock("@/lib/supabase", () => ({ createAdminClient: () => boundary.db }));
// Only this isolated test substitutes the disabled production flag. It invokes
// actual route handlers, real Ed25519 verification and the synthetic SQL store.
vi.mock("./policy", async original => ({ ...await original<typeof import("./policy")>(), walletAuthEnabled: () => true }));
import { POST as issue } from "@/app/api/solana/auth/challenge/route";
import { POST as verify } from "@/app/api/solana/auth/verify/route";
import { POST as logout } from "@/app/api/solana/auth/logout/route";
import { GET as session } from "@/app/api/solana/auth/session/route";
import { digest } from "./auth-crypto";

let pg: any, sequence = 0;
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
function encode(bytes: Buffer) { const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"; let n = BigInt(`0x${bytes.toString("hex")}`), result = ""; while(n) { result = alphabet[Number(n % BigInt(58))] + result; n /= BigInt(58); } for(const byte of bytes) { if(byte !== 0) break; result = "1" + result; } return result; }
const wallet = encode(publicKey.export({ type: "spki", format: "der" }).subarray(-32));
const origin = "https://staging.example.invalid";
function request(body: unknown, requestOrigin = origin) { return new Request(origin + "/api/solana/auth", { method: "POST", headers: { "content-type": "application/json", origin: requestOrigin }, body: JSON.stringify(body) }); }
function signature(message: string) { return sign(null, Buffer.from(message), privateKey).toString("base64"); }
beforeAll(async () => {
  const modulePath = process.env.SOL_FOUNDATION_PGLITE_MODULE;
  if(!modulePath) throw new Error("Set SOL_FOUNDATION_PGLITE_MODULE to the local synthetic PostgreSQL runtime; no production connection is supported.");
  const { PGlite } = await import(/* @vite-ignore */ modulePath);
  pg = new PGlite();
  await pg.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; GRANT USAGE ON SCHEMA public TO service_role;");
  await pg.exec(readFileSync("supabase/security/staging/phase1-wallet-identity.sql", "utf8"));
  await pg.exec(readFileSync("supabase/security/staging/phase3-session-rotation.sql", "utf8"));
  await pg.exec(readFileSync("supabase/security/staging/phase1-members.sql", "utf8"));
  await pg.exec("SET ROLE service_role");
  boundary.db = { rpc: async (name: string, args: Record<string, unknown>) => {
    try {
      if(name === "gp_sol_issue_challenge") { const result = await pg.query("SELECT gp_sol_issue_challenge($1,$2,$3,$4,$5,$6) id", [args.p_rate_key,args.p_wallet,args.p_nonce,args.p_binding_hash,args.p_message,args.p_expires_at]); return { data: result.rows[0].id, error: null }; }
      if(name === "gp_sol_consume_challenge") return { data: (await pg.query("SELECT * FROM gp_sol_consume_challenge($1,$2)", [args.p_id,args.p_binding_hash])).rows, error: null };
      if(name === "gp_sol_create_session") { await pg.query("SELECT gp_sol_create_session($1,$2,$3)",[args.p_wallet,args.p_token_hash,args.p_expires_at]); return { data: null,error:null }; }
      if(name === "gp_sol_member_login") { await pg.query("SELECT gp_sol_member_login($1,$2,$3,$4,$5)",[args.p_wallet,args.p_token_hash,args.p_expires_at,args.p_previous_token_hash,args.p_referral]); return {data:null,error:null}; }
      if(name === "gp_sol_rotate_session") { await pg.query("SELECT gp_sol_rotate_session($1,$2,$3,$4)",[args.p_wallet,args.p_token_hash,args.p_expires_at,args.p_previous_token_hash]); return { data:null,error:null }; }
      throw new Error("Unexpected staging RPC");
    } catch(error) { return { data: null,error }; }
  }, from: (table: string) => {
    if(!["gp_sol_sessions","gp_sol_identities"].includes(table)) throw new Error("Unexpected staging table");
    return { update: (record: {revoked_at:string}) => ({ eq: async (field:string,value:string) => {
      if(field!=="token_hash")throw new Error("Unexpected session field");
      try { await pg.query("UPDATE gp_sol_sessions SET revoked_at=$1 WHERE token_hash=$2",[record.revoked_at,value]);return {error:null}; } catch(error){return {error};}
    } }), select: (columns:string) => {
      if(!["wallet_address,expires_at","wallet_address"].includes(columns))throw new Error("Unexpected staging columns");
      const clauses:string[]=[],parameters:unknown[]=[];
      const query:any={eq:(field:string,value:unknown)=>{if(!["token_hash","wallet_address","banned"].includes(field))throw new Error("Unexpected condition");parameters.push(value);clauses.push(`${field}=$${parameters.length}`);return query;},is:(field:string,value:unknown)=>{if(field!=="revoked_at"||value!==null)throw new Error("Unexpected null condition");clauses.push("revoked_at IS NULL");return query;},gt:(field:string,value:string)=>{if(field!=="expires_at")throw new Error("Unexpected expiry condition");parameters.push(value);clauses.push(`expires_at>$${parameters.length}`);return query;},maybeSingle:async()=>{try{return {data:(await pg.query(`SELECT ${columns} FROM ${table} WHERE ${clauses.join(" AND ")}`,parameters)).rows[0]||null,error:null};}catch(error){return {data:null,error};}}};
      return query;
    } };
  } };
});
beforeEach(async () => {
  boundary.jar.clear(); sequence++;
  vi.stubEnv("NEXT_PUBLIC_SITE_URL",origin); vi.stubEnv("SOLANA_AUTH_RATE_SECRET","synthetic-staging-rate-secret-".repeat(2)); vi.stubEnv("VERCEL","0");
  // Isolate each case without modifying immutable journals or any production data.
  await pg.exec("RESET ROLE; DELETE FROM gp_sol_member_follows; DELETE FROM gp_sol_members; SET ROLE service_role; DELETE FROM gp_sol_sessions; DELETE FROM gp_sol_challenges; DELETE FROM gp_sol_identities;");
});
afterAll(async () => { await pg?.close(); vi.unstubAllEnvs(); });
async function challenge() { const response = await issue(request({ wallet })); expect(response.status).toBe(200); return response.json(); }
describe("Synthetic wallet route + SQL integration", () => {
  it("authenticates real synthetic signatures and persists only session hashes", async () => {
    const data = await challenge();
    expect(data.message).toContain("staging.example.invalid wants you to sign in");
    const response = await verify(request({ challengeId: data.challengeId, signature: signature(data.message) }));
    expect(response.status).toBe(200);
    const token = boundary.jar.get("gp-solana-session")!;
    const stored = (await pg.query("SELECT token_hash,wallet_address FROM gp_sol_sessions")).rows;
    expect(stored).toEqual([{ token_hash: digest(token), wallet_address: wallet }]); expect(JSON.stringify(stored)).not.toContain(token);
  });
  it("keeps two independently signed wallets in separate permanent member accounts", async()=>{
    const first=await challenge();await verify(request({challengeId:first.challengeId,signature:signature(first.message)}));
    const originalMember=(await pg.query('SELECT id,referral_code FROM gp_sol_members WHERE wallet_address=$1',[wallet])).rows[0];const original=originalMember.id;
    const second=generateKeyPairSync('ed25519');const otherWallet=encode(second.publicKey.export({type:'spki',format:'der'}).subarray(-32));
    boundary.jar.clear();const data=await(await issue(request({wallet:otherWallet}))).json();
    expect((await verify(request({challengeId:data.challengeId,signature:sign(null,Buffer.from(data.message),second.privateKey).toString('base64'),referralCode:originalMember.referral_code}))).status).toBe(200);
    expect((await(await session()).json()).wallet).toBe(otherWallet);
    const records=(await pg.query('SELECT id,wallet_address FROM gp_sol_members')).rows;
    expect((await pg.query('SELECT count(*)::int n FROM gp_sol_members WHERE referred_by=$1',[original])).rows[0].n).toBe(1);expect(records).toHaveLength(2);expect(records.find((row:any)=>row.wallet_address===wallet).id).toBe(original);
    expect(records.find((row:any)=>row.wallet_address===otherWallet).id).not.toBe(original);
  });
  it("rejects a trivial small-order signature without creating a member or session",async()=>{
    const point=Buffer.alloc(32);point[0]=1;const address=encode(point);
    const challenge=await(await issue(request({wallet:address}))).json();
    const forged=Buffer.alloc(64);point.copy(forged);
    expect((await verify(request({challengeId:challenge.challengeId,signature:forged.toString('base64')}))).status).toBe(401);
    expect((await pg.query('SELECT count(*)::int n FROM gp_sol_members')).rows[0].n).toBe(0);
    expect((await pg.query('SELECT count(*)::int n FROM gp_sol_sessions')).rows[0].n).toBe(0);
  });
  it("permits one attempt across two simultaneous submissions to the serialized fixture", async () => {
    const data = await challenge(), body = { challengeId:data.challengeId,signature:signature(data.message) };
    const responses = await Promise.all([verify(request(body)), verify(request(body))]);
    expect(responses.map(r=>r.status).sort()).toEqual([200,401]);
    expect((await pg.query("SELECT count(*)::int count FROM gp_sol_sessions")).rows[0].count).toBe(1);
  });
  it("rejects wrong browser binding without consuming the owner's challenge", async () => {
    const data = await challenge(), binding = boundary.jar.get("gp-solana-challenge")!;
    boundary.jar.set("gp-solana-challenge","x".repeat(43));
    expect((await verify(request({ challengeId:data.challengeId,signature:signature(data.message) }))).status).toBe(401);
    boundary.jar.set("gp-solana-challenge",binding);
    expect((await verify(request({ challengeId:data.challengeId,signature:signature(data.message) }))).status).toBe(200);
  });
  it("rejects altered messages and burns the failed attempt", async () => {
    const data = await challenge(), binding = boundary.jar.get("gp-solana-challenge")!;
    expect((await verify(request({ challengeId:data.challengeId,signature:signature(data.message+"tampered") }))).status).toBe(401);
    boundary.jar.set("gp-solana-challenge",binding);
    expect((await verify(request({ challengeId:data.challengeId,signature:signature(data.message) }))).status).toBe(401);
  });
  it("rejects an expired SQL challenge without issuing a session", async () => {
    const data = await challenge();
    await pg.query("UPDATE gp_sol_challenges SET issued_at=now()-interval '6 minutes',expires_at=now()-interval '1 minute' WHERE id=$1",[data.challengeId]);
    expect((await verify(request({ challengeId:data.challengeId,signature:signature(data.message) }))).status).toBe(401);
  });
  it("rejects a wallet banned between challenge issuance and verification", async () => {
    const data = await challenge(); await pg.query("INSERT INTO gp_sol_identities(wallet_address,banned) VALUES($1,true)",[wallet]);
    expect((await verify(request({ challengeId:data.challengeId,signature:signature(data.message) }))).status).toBe(503);
    expect((await pg.query("SELECT count(*)::int count FROM gp_sol_sessions")).rows[0].count).toBe(0);
  });
  it("rejects cross-origin requests before any SQL challenge is created", async () => {
    expect((await issue(request({wallet},"https://attacker.invalid"))).status).toBe(403);
    expect((await pg.query("SELECT count(*)::int count FROM gp_sol_challenges")).rows[0].count).toBe(0);
  });
  it("enforces the SQL-backed five-challenge wallet rate bound", async () => {
    for(let n=0;n<5;n++) expect((await issue(request({wallet}))).status).toBe(200);
    expect((await issue(request({wallet}))).status).toBe(429);
  });
  it("rotates the previous browser session atomically after renewed ownership proof",async()=>{
    const first=await challenge();await verify(request({challengeId:first.challengeId,signature:signature(first.message)}));
    const oldToken=boundary.jar.get("gp-solana-session")!;
    const second=await challenge();expect((await verify(request({challengeId:second.challengeId,signature:signature(second.message)}))).status).toBe(200);
    expect(boundary.jar.get("gp-solana-session")).not.toBe(oldToken);
    expect((await pg.query("SELECT revoked_at FROM gp_sol_sessions WHERE token_hash=$1",[digest(oldToken)])).rows[0].revoked_at).not.toBeNull();
    expect((await session()).status).toBe(200);
  });
  it("revokes a session on logout and rejects its restored stale cookie",async()=>{
    const data=await challenge();await verify(request({challengeId:data.challengeId,signature:signature(data.message)}));
    const token=boundary.jar.get("gp-solana-session")!;
    expect((await session()).status).toBe(200);expect((await logout(request({}))).status).toBe(200);
    boundary.jar.set("gp-solana-session",token);expect((await session()).status).toBe(401);
  });
  it("rejects an otherwise valid session immediately when the identity is banned",async()=>{
    const data=await challenge();await verify(request({challengeId:data.challengeId,signature:signature(data.message)}));
    await pg.query("UPDATE gp_sol_identities SET banned=true WHERE wallet_address=$1",[wallet]);expect((await session()).status).toBe(401);
  });
  it("preserves the old session when replacement creation fails",async()=>{
    const data=await challenge();await verify(request({challengeId:data.challengeId,signature:signature(data.message)}));
    const oldHash=digest(boundary.jar.get("gp-solana-session")!);
    await expect(pg.query("SELECT gp_sol_rotate_session($1,'invalid',$2,$3)",[wallet,new Date(Date.now()+3600000).toISOString(),oldHash])).rejects.toThrow();
    expect((await pg.query("SELECT revoked_at FROM gp_sol_sessions WHERE token_hash=$1",[oldHash])).rows[0].revoked_at).toBeNull();
    expect((await session()).status).toBe(200);
  });
  it("denies direct browser-role invocation of session rotation",async()=>{
    for(const role of ["anon","authenticated"]){
      await pg.exec(`SET ROLE ${role}`);
      try{await expect(pg.query("SELECT gp_sol_rotate_session($1,$2,now()+interval '1 hour',null)",[wallet,"a".repeat(64)])).rejects.toThrow(/permission denied/);}
      finally{await pg.exec("RESET ROLE;SET ROLE service_role");}
    }
  });
});

describe('Phantom mobile encrypted return lifecycle',()=>{
 it('decrypts a signed mobile return and establishes the original browser member session',async()=>{
  const {default:nacl}=await import('tweetnacl');
  const {createLinkKeyPair,sharedSecret,encodeBase58,openJson,signatureBase64,sealJson,decodeBase58}=await import('./wallet-deeplink');
  const dapp=createLinkKeyPair(),phantom=createLinkKeyPair();
  const appSecret=sharedSecret(phantom.publicKey,dapp.secretKey),walletSecret=sharedSecret(dapp.publicKey,phantom.secretKey);
  const challenge=await (await issue(request({wallet}))).json();
  const outbound=sealJson({message:encodeBase58(new TextEncoder().encode(challenge.message)),session:'synthetic-phantom-session',display:'utf8'},appSecret);
  const approved=openJson(outbound.payload,outbound.nonce,walletSecret);
  const message=new TextDecoder().decode(decodeBase58(approved.message as string));
  const signed=sign(null,Buffer.from(message),privateKey),nonce=nacl.randomBytes(24);
  const encrypted=nacl.box.after(new TextEncoder().encode(JSON.stringify({signature:encodeBase58(signed)})),nonce,walletSecret);
  const callback=openJson(encodeBase58(encrypted),encodeBase58(nonce),appSecret);
  const response=await verify(request({challengeId:challenge.challengeId,signature:signatureBase64(callback.signature as string)}));
  expect(response.status).toBe(200);expect((await (await session()).json()).wallet).toBe(wallet);
  expect((await pg.query('SELECT count(*)::int n FROM gp_sol_members WHERE wallet_address=$1',[wallet])).rows[0].n).toBe(1);
 });
});
