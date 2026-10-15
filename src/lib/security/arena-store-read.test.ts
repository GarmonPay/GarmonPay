import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn(), select: vi.fn(), eq: vi.fn(), order: vi.fn(), insert: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/auth-request", () => ({ getAuthUserId: mocks.auth }));
vi.mock("@/lib/supabase", () => ({ createAdminClient: mocks.admin }));
import { GET } from "@/app/api/arena/store/items/route";
beforeEach(() => {
  vi.clearAllMocks(); mocks.auth.mockResolvedValue("synthetic-user");
  const query = { select: mocks.select, eq: mocks.eq, order: mocks.order, insert: mocks.insert };
  mocks.select.mockReturnValue(query); mocks.eq.mockReturnValue(query);
  mocks.order.mockReturnValueOnce(query).mockResolvedValueOnce({ data: [], error: null });
  mocks.from.mockReturnValue(query); mocks.admin.mockReturnValue({ from: mocks.from });
});
describe("Read-only arena store", () => {
  it("returns an empty catalog without seeding prices", async () => {
    const result = await GET(new Request("https://garmonpay.com/api/arena/store/items"));
    expect(result.status).toBe(200); expect((await result.json()).items).toEqual([]);
    expect(mocks.insert).not.toHaveBeenCalled(); expect(mocks.from).toHaveBeenCalledOnce();
  });
  it("filters an existing approved category without changing prices", async () => {
    await GET(new Request("https://garmonpay.com/api/arena/store/items?category=Gloves"));
    expect(mocks.eq).toHaveBeenCalledWith("category", "Gloves"); expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("rejects unauthenticated requests before touching storage", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await GET(new Request("https://garmonpay.com/api/arena/store/items"))).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
