import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import ts from "typescript";
const source = readFileSync("server/fight-server.js", "utf8");
const ast = ts.createSourceFile("fight-server.js", source, ts.ScriptTarget.Latest, true);
const names = ["verifyJoinToken", "closeBetting", "saveFightResult", "advanceTournamentBracket", "workerHealth", "authorizeFightJoin"];
const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text || "")).map(node => node.getText(ast)).join("\n");
function worker(secret = "", revision = "") {
  const context = vm.createContext({ require: createRequire(import.meta.url), Buffer, Date, process: { env: { RENDER_GIT_COMMIT: revision } } });
  return vm.runInContext(`const crypto = require('node:crypto'); const ARENA_JOIN_SECRET = ${JSON.stringify(secret)}; const FINANCIAL_OPERATIONS_PAUSED = true; ${functions}; ({verifyJoinToken,closeBetting,saveFightResult,advanceTournamentBracket,workerHealth,authorizeFightJoin})`, context);
}
describe("Standalone arena security", () => {
  it("binds the signed subject to the loaded fighter owner and rejects ended fights",()=>{
    const context=worker("x".repeat(32)),payload={fightId:"fight",fighterAId:"fighter",userId:"owner"},fight={id:"fight",fighter_a_id:"fighter"},fighter={id:"fighter",user_id:"owner"};
    expect(context.authorizeFightJoin(payload,fight,fighter)).toBe(true);
    expect(context.authorizeFightJoin({...payload,userId:"other"},fight,fighter)).toBe(false);
    expect(context.authorizeFightJoin(payload,{...fight,winner_id:"ended"},fighter)).toBe(false);
  });
  it("accepts a bounded signed token but rejects replay after expiry and unbounded expiration",()=>{
    const secret="x".repeat(32),context=worker(secret);
    const make=(exp:number)=>{const payload={fightId:"12345678-1234-1234-1234-123456789012",userId:"12345678-1234-1234-1234-123456789013",fighterAId:"12345678-1234-1234-1234-123456789014",exp};const sig=createHmac("sha256",secret).update(JSON.stringify(payload)).digest("hex");return Buffer.from(JSON.stringify({...payload,sig})).toString("base64url");};
    expect(context.verifyJoinToken(make(Date.now()+300000))).not.toBeNull();
    expect(context.verifyJoinToken(make(Date.now()-1))).toBeNull();
    expect(context.verifyJoinToken(make(Date.now()+1000000))).toBeNull();
  });
  it("reports pause and bounded public revision without disclosing signing secrets", () => {
    const secret = "synthetic-signing-secret-" + "x".repeat(32);
    const health = worker(secret, "a".repeat(40)).workerHealth();
    expect(health).toMatchObject({ settlementPaused: true, buildRevision: "a".repeat(40), joinSecretConfigured: true });
    expect(JSON.stringify(health)).not.toContain(secret);
    expect(worker("", "untrusted-value").workerHealth()).toMatchObject({ buildRevision: null, joinSecretConfigured: false });
  });
  it("rejects missing and known fallback signing secrets", () => {
    expect(worker().verifyJoinToken("forged")).toBeNull();
    expect(worker("short").verifyJoinToken("forged")).toBeNull();
    const secret = "arena-join-secret-change-in-production";
    const payload = { fightId: "fixture", userId: "fixture", fighterAId: "fixture", exp: Date.now() + 10000 };
    const sig = createHmac("sha256", secret).update(JSON.stringify(payload)).digest("hex");
    expect(worker(secret).verifyJoinToken(Buffer.from(JSON.stringify({ ...payload, sig })).toString("base64url"))).toBeNull();
  });
  it.each(["closeBetting", "saveFightResult", "advanceTournamentBracket"])("pauses %s before any database access", async name => {
    const access = vi.fn(() => { throw new Error("Unexpected write"); });
    const db = { from: access, rpc: access };
    await worker("x".repeat(32))[name](db, "fixture");
    expect(access).not.toHaveBeenCalled();
  });
});
