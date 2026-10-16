import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), insert: vi.fn(), publisher: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/solana/members", () => ({ memberSessionHash: async () => "a".repeat(64) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.publisher }));
vi.mock("./prices", () => ({ lookupUsdPrice: async (symbol: string) => ({ symbol, microusd: symbol === "SOL" ? "100000000" : "50000000000", source: "coingecko", observedAt: Date.now() - 1000 }) }));
import { recordWalletPaperFill } from "./wallet-account";
const requestId = "12345678-1234-4234-8234-123456789abc";
const order = { requestId, symbol: "BTC", side: "buy" as const, amount: "1" };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://isolated.example.invalid");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "public-test-key");
  vi.stubEnv("MEMBER_PRICE_PUBLISHER_JWT", "test-publisher-jwt");
  mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "gp_sol_member_me" ? { id: "member-one" } : name === "gp_member_paper_request" ? null : { virtual: true, cashLamports: "9000000000" }, error: null }));
  mocks.insert.mockResolvedValue({ error: null });
  mocks.publisher.mockReturnValue({ from: () => ({ insert: mocks.insert }) });
});
afterEach(() => vi.unstubAllEnvs());
describe("paper server trust boundaries", () => {
  it("passes the validated request ID and stored observation, ignoring browser prices", async () => {
    await recordWalletPaperFill({ ...order, tokenMicrousd: "1", priceSource: "browser" } as typeof order);
    expect(mocks.publisher).toHaveBeenCalledWith("https://isolated.example.invalid", "public-test-key", expect.objectContaining({
      global: { headers: { Authorization: "Bearer test-publisher-jwt", Prefer: "return=minimal" } },
    }));
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.insert.mock.calls[0]).toHaveLength(1);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ source: "coingecko", asset_id: "bitcoin", token_microusd: "50000000000" }));
    expect(mocks.insert.mock.results[0]?.value?.select).toBeUndefined();
    const args = mocks.rpc.mock.calls.find(([name]) => name === "gp_member_record_paper_fill")?.[1];
    expect(args).toMatchObject({ p_request_id: requestId, p_observation_id: mocks.insert.mock.calls[0][0].id });
    expect(args).not.toHaveProperty("p_token_microusd");
  });
  it("recovers a committed retry before requiring a publisher or a new quote", async () => {
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "gp_sol_member_me" ? { id: "member-one" } : { virtual: true, cashLamports: "9000000000" }, error: null }));
    vi.stubEnv("MEMBER_PRICE_PUBLISHER_JWT", "");
    expect(await recordWalletPaperFill(order)).toMatchObject({ cashLamports: "9000000000", priceSource: "stored observation" });
    expect(mocks.publisher).not.toHaveBeenCalled();
  });
  it("rejects an invalid request ID before authentication or writes", async () => {
    await expect(recordWalletPaperFill({ ...order, requestId: "invalid" })).rejects.toThrow(/request ID/);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("fails closed without a publisher credential", async () => {
    vi.stubEnv("MEMBER_PRICE_PUBLISHER_JWT", "");
    await expect(recordWalletPaperFill(order)).rejects.toThrow(/not configured/);
    expect(mocks.publisher).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });
  it("does not trade when observation publication is denied", async () => {
    mocks.insert.mockResolvedValue({ error: { code: "42501" } });
    await expect(recordWalletPaperFill(order)).rejects.toThrow(/observation was rejected/);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });
  it("rejects another member's claimed identity before publishing", async () => {
    await expect(recordWalletPaperFill({ ...order, memberId: "other-member" })).rejects.toThrow(/does not match/);
    expect(mocks.publisher).not.toHaveBeenCalled();
  });
});
