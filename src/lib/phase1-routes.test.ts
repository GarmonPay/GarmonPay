import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin: vi.fn(() => null), financial: vi.fn(), fetch: vi.fn(() => { throw new Error("External requests prohibited in security tests"); }) }));
vi.mock("./supabase", () => ({ createAdminClient: mocks.admin, createServerClient: () => null }));
vi.mock("./auth-request", () => ({ getAuthUserId: async () => null, getAuthUserIdStrict: async () => null }));
vi.mock("./admin-auth", () => ({ isAdmin: async () => false }));
vi.mock("../../backend/src/services/supabase", () => ({ supabase: { from: mocks.financial } }));
import { POST as advertiserDeposit } from "@/app/api/advertiser/deposit/route.js";
import { creditReward } from "../../backend/src/controllers/rewardsController";
import { requireAuth } from "../../backend/src/middleware/auth";
import { GET as diagnostic } from "@/app/api/arena/test-meshy/route";
import { GET as meshStatus } from "@/app/api/arena/fighter/3d-status/route";
import { GET as dashboard } from "@/app/api/dashboard/route";
import { GET as deposits } from "@/app/api/deposits/list/route";
import { POST as seedAdmin } from "@/app/api/admin/seed/route";
import { POST as ensureAdmin } from "@/app/api/auth/admin/ensure-admin/route";
import { GET as membershipGet, POST as membershipPost } from "@/app/api/cron/membership-renewal/route";
import { POST as commissions } from "@/app/api/cron/process-referral-commissions/route";
import { POST as social } from "@/app/api/cron/social-reverify/route";
import { GET as jackpot } from "@/app/api/cron/arena-jackpot/route";
import { POST as margin } from "@/app/api/cron/margin-throttle/route";
import { GET as timeouts } from "@/app/api/celo/cron/player-timeouts/route";
import { GET as cleanup } from "@/app/api/celo/rooms/cleanup-abandoned/route";
import { isCronAuthorized } from "./cron-auth";
const req = (headers: Record<string,string> = {}) => new Request("http://localhost/api/test", { headers });
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", mocks.fetch); vi.stubEnv("CRON_SECRET", ""); vi.stubEnv("ADMIN_SETUP_SECRET", ""); vi.stubEnv("MESHY_API_KEY", "test-do-not-use"); vi.stubEnv("ARENA_JOIN_SECRET", "join-secret-must-not-authorize-cron"); });
describe("Phase 1 protected routes: no real financial operations", () => {
  it("disables unauthenticated advertiser balance overwrites before touching the DB", async () => { expect((await advertiserDeposit()).status).toBe(410); expect(mocks.admin).not.toHaveBeenCalled(); });
  it.each([{ userId: "victim", amount: 999999 }, { userId: "caller", amount: 1 }, {}])("rejects arbitrary reward bodies %j", async (body) => {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await creditReward({ userId: "ordinary-user", body } as never, res as never);
    expect(res.status).toHaveBeenCalledWith(410); expect(mocks.financial).not.toHaveBeenCalled();
  });
  it("reward middleware rejects unauthenticated IDs", async () => { const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }; const next = vi.fn(); await requireAuth({ headers: { "x-user-id": "victim" } } as never, res as never, next); expect(res.status).toHaveBeenCalledWith(401); expect(next).not.toHaveBeenCalled(); });
  it("paid diagnostics cannot invoke any external API", async () => { expect((await diagnostic()).status).toBe(410); expect(mocks.fetch).not.toHaveBeenCalled(); });
  it("anonymous paid status polling is rejected", async () => { expect((await meshStatus(req())).status).toBe(401); expect(mocks.fetch).not.toHaveBeenCalled(); });
  it("dashboard and deposits reject unverified identity", async () => { expect((await dashboard(req({ "X-User-Id": "victim" }))).status).toBe(401); expect((await deposits(req({ "X-Admin-Id": "owner", "X-User-Id": "victim" }))).status).toBe(401); expect(mocks.admin).not.toHaveBeenCalled(); });
  it("admin setup fails closed in non-production too", async () => { expect((await ensureAdmin(req())).status).toBe(403); expect(mocks.admin).not.toHaveBeenCalled(); });
  it("bootstrap endpoints cannot bypass authenticated admin roles using a secret or ID", async () => {
    vi.stubEnv("ADMIN_SETUP_SECRET", "configured-secret"); vi.stubEnv("ADMIN_SEED_SECRET", "configured-secret");
    expect((await ensureAdmin(req({ "X-Admin-Id": "owner", "x-admin-setup-secret": "configured-secret" }))).status).toBe(403);
    expect((await seedAdmin(req({ "X-Admin-Id": "owner", "x-admin-seed-secret": "configured-secret" }))).status).toBe(403);
    expect(mocks.admin).not.toHaveBeenCalled();
  });

});
const crons = [membershipGet, membershipPost, commissions, social, jackpot, margin, timeouts, cleanup];
describe("Cron configuration", () => {
  it.each(crons.map((handler,i) => [i, handler] as const))("job %s fails closed with no secret", async (_, handler) => { const response = await handler(req()); expect([401,500,503]).toContain(response.status); expect(mocks.admin).not.toHaveBeenCalled(); expect(mocks.fetch).not.toHaveBeenCalled(); });
  it.each(crons.map((handler,i) => [i, handler] as const))("job %s rejects incorrect secret", async (_, handler) => { vi.stubEnv("CRON_SECRET", "configured-secret"); const response = await handler(req({ Authorization: "Bearer wrong" })); expect(response.status).toBe(401); expect(mocks.admin).not.toHaveBeenCalled(); });
  it("blank secrets and alternate Arena secrets do not authorize", () => { vi.stubEnv("CRON_SECRET", "   "); expect(isCronAuthorized(req({ Authorization: "Bearer join-secret-must-not-authorize-cron" }))).toBe(false); });
  it("preserves authorized Bearer and X-Cron-Secret jobs without executing them", () => { vi.stubEnv("CRON_SECRET", "configured-secret"); expect(isCronAuthorized(req({ Authorization: "Bearer configured-secret" }))).toBe(true); expect(isCronAuthorized(req({ "X-Cron-Secret": "configured-secret" }))).toBe(true); });
});
