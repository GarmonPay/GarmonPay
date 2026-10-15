import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ cookie: null as string | null, user: null as string | null, role: "member", superAdmin: false, banned: false as boolean | undefined, roleError: false, lookedUp: "", clients: 0 }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => state.cookie ? { value: state.cookie } : undefined }) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => {
  state.clients++;
  return { auth: { getUser: async () => ({ data: { user: state.user ? { id: state.user } : null }, error: null }) },
    from: () => ({ select: () => ({ eq: (_: string, id: string) => { state.lookedUp = id; return { maybeSingle: async () => ({ data: { role: state.role, is_super_admin: state.superAdmin, banned: state.banned }, error: state.roleError ? new Error("Denied") : null }) }; } }) }) };
} }));
vi.mock("./god-mode-db", () => ({ getGodModeStats: vi.fn(async () => ({})), getOwnerFlags: vi.fn(async () => ({})), getPlatformProfitCents: () => 0, updateOwnerFlags: vi.fn(async () => ({})) }));
import { getAdminAuthUserId, isSuperAdminRequest } from "./admin-auth";
import { GET } from "@/app/api/god-mode/route";
import { PATCH } from "@/app/api/god-mode/controls/route";
import { updateOwnerFlags } from "./god-mode-db";
const req = (headers: Record<string, string> = {}) => new Request("http://localhost/api/god-mode", { headers });
beforeEach(() => { vi.clearAllMocks(); Object.assign(state, { cookie: null, user: null, role: "member", superAdmin: false, banned: false, roleError: false, lookedUp: "", clients: 0 }); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-key"); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-test"); });
describe("Authenticated admin authorization", () => {
  it.each([true, undefined])("denies a restricted admin with banned=%s", async banned => { state.user="owner"; state.superAdmin=true; state.banned=banned; expect(await getAdminAuthUserId(req({ Authorization: "Bearer valid" }))).toBeNull(); });
  it("fails closed when the trusted role lookup is unavailable", async () => { vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", ""); state.user="owner"; state.superAdmin=true; expect(await getAdminAuthUserId(req({ Authorization: "Bearer valid" }))).toBeNull(); expect(state.clients).toBe(0); });
  it("rejects a super-admin ID without any authenticated session", async () => { expect(await getAdminAuthUserId(req({ "X-Admin-Id": "owner" }))).toBeNull(); expect(state.clients).toBe(0); });
  it("rejects forged tokens", async () => { expect(await isSuperAdminRequest(req({ Authorization: "Bearer forged", "X-Admin-Id": "owner" }))).toBe(false); });
  it("checks the authenticated caller's role, ignoring an owner header", async () => { state.user = "ordinary-user"; expect(await isSuperAdminRequest(req({ Authorization: "Bearer valid", "X-Admin-Id": "owner" }))).toBe(false); expect(state.lookedUp).toBe("ordinary-user"); });
  it("keeps regular admin access but denies God Mode", async () => { state.user = "admin"; state.role = "admin"; const r = req({ Authorization: "Bearer valid" }); expect(await getAdminAuthUserId(r)).toBe("admin"); expect(await isSuperAdminRequest(r)).toBe(false); });
  it("preserves a verified owner admin-cookie session", async () => { state.cookie = "verified-token"; state.user = "owner"; state.superAdmin = true; expect(await isSuperAdminRequest(req())).toBe(true); expect((await GET(req())).status).toBe(200); });
  it("God Mode GET rejects impersonation", async () => { expect((await GET(req({ "X-Admin-Id": "owner" }))).status).toBe(403); });
  it("God Mode controls reject impersonation before any write", async () => { expect((await PATCH(req({ "X-Admin-Id": "owner" }))).status).toBe(403); expect(updateOwnerFlags).not.toHaveBeenCalled(); });
});
