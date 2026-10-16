import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), policy: "seven-day-atomic-v1" as string | null }));
vi.mock("@/lib/supabase", () => ({ createAdminClient: () => ({ rpc: mocks.rpc, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({data:{username:"current_name",wallet_address:"wallet-one",username_changed_at:null},error:null}) }) }) }) }) }));
vi.mock("./members", async original => ({ ...await original<typeof import("./members")>(), memberSessionHash: async () => "a".repeat(64) }));
vi.mock("./member-picture", () => ({ normalizeMemberPicture: async (picture: string | null) => picture }));
vi.mock("./member-presentation.server", () => ({ presentMembers: async (_db: unknown, rows: unknown[]) => rows, saveLegacyDisplayName: vi.fn() }));
import { PATCH } from "@/app/api/solana/members/me/route";
const id="12345678-1234-4234-8234-123456789abc";
const request=(handle: string, actorId=id) => new Request("https://garmonpay.com/api/solana/members/me", { method:"PATCH",headers:{origin:"https://garmonpay.com","content-type":"application/json"},body:JSON.stringify({actorId,handle,displayName:"Member Name",biography:"",picture:null,walletPublic:false}) });
beforeEach(() => {
 vi.clearAllMocks();vi.stubEnv("NEXT_PUBLIC_SITE_URL","https://garmonpay.com");mocks.policy="seven-day-atomic-v1";
 mocks.rpc.mockImplementation(async (name: string) => name==="gp_sol_member_me" ? { data:{id,username:"current_name",wallet:"wallet-one"},error:null } : name==="gp_sol_username_policy" ? {data:mocks.policy,error:mocks.policy?null:{code:"PGRST202"}} : {data:null,error:null});
});
afterEach(()=>vi.unstubAllEnvs());
describe("profile rename release boundary",()=>{
 it("preserves profile and username when only the old database RPC exists",async()=>{
  mocks.policy=null;expect((await PATCH(request("new_name"))).status).toBe(409);
  expect(mocks.rpc.mock.calls.some(([name])=>name==="gp_sol_member_save")).toBe(false);
 });
 it("lets ordinary profile edits work while the cooldown migration awaits approval",async()=>{
  mocks.policy=null;expect((await PATCH(request("current_name"))).status).toBe(200);
  expect(mocks.rpc.mock.calls.some(([name])=>name==="gp_sol_username_policy")).toBe(false);
 });
 it("allows rename submission only when the atomic policy is available",async()=>{
  expect((await PATCH(request("new_name"))).status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledWith("gp_sol_member_save",expect.objectContaining({p_username:"new_name",p_hash:"a".repeat(64)}));
 });
 it("rejects an outdated actor before any policy or save call",async()=>{
  expect((await PATCH(request("new_name","22345678-1234-4234-8234-123456789abc"))).status).toBe(409);
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
 });
});
