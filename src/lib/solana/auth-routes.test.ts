import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({cookieGet:vi.fn(),cookieSet:vi.fn(),cookieDelete:vi.fn(),db:vi.fn(),rpc:vi.fn(),verify:vi.fn()}));
vi.mock("next/headers",()=>({cookies:()=>({get:mocks.cookieGet,set:mocks.cookieSet,delete:mocks.cookieDelete})}));
vi.mock("@/lib/supabase",()=>({createAdminClient:mocks.db}));
// Exercise inactive implementation in isolation; production policy stays hard-disabled.
vi.mock("./policy",async original=>({...await original<typeof import("./policy")>(),walletAuthEnabled:()=>process.env.SOLANA_WALLET_AUTH_ENABLED === "true"}));
vi.mock("./auth-crypto",async original=>({...await original<typeof import("./auth-crypto")>(),verifyWalletSignature:mocks.verify}));
import { POST as issue } from "@/app/api/solana/auth/challenge/route";
import { POST as verify } from "@/app/api/solana/auth/verify/route";
import { POST as validate } from "@/app/api/solana/launches/validate/route";
const id="12345678-1234-1234-1234-123456789012";
function request(body:unknown,origin="https://garmonpay.com"){return new Request("https://garmonpay.com/api/solana/auth",{method:"POST",headers:{"Content-Type":"application/json",origin},body:JSON.stringify(body)});}
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("SOLANA_WALLET_AUTH_ENABLED","true");vi.stubEnv("SOLANA_AUTH_RATE_SECRET","a".repeat(32));vi.stubEnv("VERCEL","0");vi.stubEnv("NEXT_PUBLIC_SITE_URL","https://garmonpay.com");mocks.db.mockReturnValue({rpc:mocks.rpc});mocks.cookieGet.mockReturnValue({value:"b".repeat(43)});});
describe("wallet auth route boundary",()=>{
 it("fails closed before touching storage when activation is disabled",async()=>{vi.stubEnv("SOLANA_WALLET_AUTH_ENABLED","false");expect((await issue(request({}))).status).toBe(503);expect((await verify(request({}))).status).toBe(503);expect(mocks.db).not.toHaveBeenCalled();});
 it("rejects cross-origin login without a write",async()=>{expect((await issue(request({wallet:"11111111111111111111111111111111"},"https://attacker.invalid"))).status).toBe(403);expect(mocks.db).not.toHaveBeenCalled();});
 it("issues a SIWS alphanumeric nonce and httpOnly binding cookie",async()=>{mocks.rpc.mockResolvedValue({data:id,error:null});expect((await issue(request({wallet:"11111111111111111111111111111111"}))).status).toBe(200);expect(mocks.rpc.mock.calls[0][1].p_nonce).toMatch(/^[a-zA-Z0-9]{32}$/);expect(mocks.rpc.mock.calls[0][1].p_message).not.toContain("wants you to sign in with your Solana account");expect(mocks.cookieSet).toHaveBeenCalledWith("gp-solana-challenge",expect.any(String),expect.objectContaining({httpOnly:true,sameSite:"lax",maxAge:300}));});
 it("returns 429 and Retry-After for a wallet rate limit",async()=>{mocks.rpc.mockResolvedValue({data:null,error:{message:"Authentication rate limit"}});const response=await issue(request({wallet:"11111111111111111111111111111111"}));expect(response.status).toBe(429);expect(response.headers.get("Retry-After")).toBe("60");expect(await response.json()).toEqual({error:"Too many sign-in attempts. Wait a minute, then try once.",code:"RATE_LIMIT"});});
 it("returns 503 for a database failure without calling it a rate limit",async()=>{mocks.rpc.mockResolvedValue({data:null,error:{message:"check constraint gp_sol_challenges_expires"}});const response=await issue(request({wallet:"11111111111111111111111111111111"}));expect(response.status).toBe(503);expect(response.headers.get("Retry-After")).toBeNull();const body=await response.json();expect(body.code).toBe("AUTH_STORE");expect(body.error).not.toMatch(/rate limit/i);});
 it("rejects a consumed or expired challenge without signature verification or session creation",async()=>{mocks.rpc.mockResolvedValue({data:[],error:null});expect((await verify(request({challengeId:id,signature:"bad"}))).status).toBe(401);expect(mocks.verify).not.toHaveBeenCalled();expect(mocks.rpc).toHaveBeenCalledTimes(1);});
 it("does not create a session for an invalid signature",async()=>{mocks.rpc.mockResolvedValue({data:[{wallet_address:"wallet",message:"message"}],error:null});mocks.verify.mockReturnValue(false);expect((await verify(request({challengeId:id,signature:"bad"}))).status).toBe(401);expect(mocks.cookieSet).not.toHaveBeenCalled();});
 it("stores only the session hash after successful ownership verification",async()=>{mocks.rpc.mockResolvedValueOnce({data:[{wallet_address:"wallet",message:"message"}],error:null}).mockResolvedValueOnce({error:null});mocks.verify.mockReturnValue(true);expect((await verify(request({challengeId:id,signature:"signature"}))).status).toBe(200);const options=mocks.rpc.mock.calls[1][1];expect(options.p_token_hash).toMatch(/^[0-9a-f]{64}$/);expect(mocks.cookieDelete).not.toHaveBeenCalled();expect(mocks.cookieSet).toHaveBeenCalledTimes(1);expect(mocks.cookieSet).toHaveBeenCalledWith("gp-solana-session",expect.any(String),expect.objectContaining({httpOnly:true,sameSite:"lax",maxAge:3600}));});
 it("bounds request size before parsing metadata",async()=>{expect((await validate(request({name:"x".repeat(9000)}))).status).toBe(400);});
});

describe("challenge identifier boundary",()=>{
 it("rejects malformed challenge identifiers before consuming a nonce",async()=>{expect((await verify(request({challengeId:"-".repeat(36),signature:"bad"}))).status).toBe(401);expect(mocks.db).not.toHaveBeenCalled();});
 it.each(["short","x".repeat(44),"!".repeat(43)])("rejects malformed browser binding %s before storage",async value=>{mocks.cookieGet.mockReturnValue({value});expect((await verify(request({challengeId:id,signature:"bad"}))).status).toBe(401);expect(mocks.db).not.toHaveBeenCalled();});
});
