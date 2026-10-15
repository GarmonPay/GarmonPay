import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ cookie: null as string | null, bearer: null as string | null, cookieError: false, banned: false, profileUnavailable: false, profileError: false }));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [] }) }));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: state.cookie ? { id: state.cookie } : null }, error: state.cookieError ? new Error("Invalid cookie") : null }) } }) }));
vi.mock("./supabase", () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: state.bearer ? { id: state.bearer } : null }, error: state.bearer ? null : new Error("Invalid token") }) } }),
  createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.profileUnavailable ? null : { banned: state.banned }, error: state.profileError ? new Error("Database unavailable") : null }) }) }) }) }),
}));
vi.mock("./wallet-ledger", () => ({ getCanonicalBalanceCents: vi.fn(async () => 1234) }));
import { GET as wallet } from "@/app/api/wallet/route";
import { getCanonicalBalanceCents } from "./wallet-ledger";
import { getAuthUserId, getAuthUserIdStrict } from "./auth-request";
const req = (headers: Record<string, string> = {}) => new Request("http://localhost/api/wallet", { headers });
beforeEach(() => { vi.clearAllMocks(); Object.assign(state, { cookie: null, bearer: null, cookieError: false, banned: false, profileUnavailable: false, profileError: false }); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-key"); });
describe("Supabase verified identity", () => {
  it("rejects a user-ID-only impersonation", async () => { expect(await getAuthUserId(req({ "X-User-Id": "victim" }))).toBeNull(); });
  it("rejects invalid tokens even with a victim ID", async () => { expect(await getAuthUserId(req({ Authorization: "Bearer forged", "X-User-Id": "victim" }))).toBeNull(); });
  it("ignores a spoofed ID when a legitimate bearer is present", async () => { state.bearer = "caller"; expect(await getAuthUserId(req({ Authorization: "Bearer valid", "X-User-Id": "victim" }))).toBe("caller"); });
  it("preserves authenticated cookie requests", async () => { state.cookie = "caller"; expect(await getAuthUserId(req())).toBe("caller"); });
  it("preserves a verified cookie when bearer has expired", async () => { state.cookie = "caller"; expect(await getAuthUserId(req({ Authorization: "Bearer expired" }))).toBe("caller"); });
  it("does not accept a cookie auth response containing an error", async () => { state.cookie = "victim"; state.cookieError = true; expect(await getAuthUserId(req())).toBeNull(); });
  it("rejects banned users", async () => { state.bearer = "caller"; state.banned = true; expect(await getAuthUserId(req({ Authorization: "Bearer valid" }))).toBeNull(); });
  it("denies access if the banned-status query fails", async () => { state.bearer = "caller"; state.profileError = true; expect(await getAuthUserId(req({ Authorization: "Bearer valid" }))).toBeNull(); });
  it("denies access when the authenticated profile is missing", async () => { state.bearer = "caller"; state.profileUnavailable = true; expect(await getAuthUserId(req({ Authorization: "Bearer valid" }))).toBeNull(); });
  it("retains bearer-only authentication for strict routes", async () => { state.cookie = "caller"; expect(await getAuthUserIdStrict(req())).toBeNull(); state.bearer = "caller"; expect(await getAuthUserIdStrict(req({ Authorization: "Bearer valid" }))).toBe("caller"); });
  it("legitimate wallet requests read only the verified user's balance", async () => {
    state.bearer = "caller";
    const response = await wallet(req({ Authorization: "Bearer valid", "X-User-Id": "victim" }));
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ balance_cents: 1234 });
    expect(getCanonicalBalanceCents).toHaveBeenCalledWith("caller");
  });
  it("cookie wallet requests still work", async () => { state.cookie = "caller"; expect((await wallet(req())).status).toBe(200); expect(getCanonicalBalanceCents).toHaveBeenCalledWith("caller"); });
  it("wallet rejects spoofed IDs before reading any balance", async () => { expect((await wallet(req({ "X-User-Id": "victim" }))).status).toBe(401); expect(getCanonicalBalanceCents).not.toHaveBeenCalled(); });

});
