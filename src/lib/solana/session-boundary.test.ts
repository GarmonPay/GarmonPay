import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ get: vi.fn(), delete: vi.fn(), set: vi.fn(), db: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), is: vi.fn(), gt: vi.fn(), maybeSingle: vi.fn(), update: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: () => ({ get: mocks.get, delete: mocks.delete, set: mocks.set }) }));
vi.mock("@/lib/supabase", () => ({ createAdminClient: mocks.db }));
vi.mock("./policy", async original => ({ ...await original<typeof import("./policy")>(), walletAuthEnabled: () => process.env.SOLANA_WALLET_AUTH_ENABLED === "true" }));
import { getSolanaSession } from "./session";
import { POST as logout } from "@/app/api/solana/auth/logout/route";
import { digest } from "./auth-crypto";
const token = "a".repeat(43);
const chain = { select: mocks.select, eq: mocks.eq, is: mocks.is, gt: mocks.gt, maybeSingle: mocks.maybeSingle, update: mocks.update };
function request(origin = "https://garmonpay.com") { return new Request("https://garmonpay.com/api/solana/auth/logout", { method: "POST", headers: { origin } }); }
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SOLANA_WALLET_AUTH_ENABLED", "true"); vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://garmonpay.com");
  mocks.get.mockReturnValue({ value: token }); mocks.db.mockReturnValue({ from: mocks.from }); mocks.from.mockReturnValue(chain);
  for (const method of [mocks.select, mocks.eq, mocks.is, mocks.gt, mocks.update]) method.mockReturnValue(chain);
});
describe("isolated wallet session boundary", () => {
  it("does not read a session while authentication is disabled", async () => {
    vi.stubEnv("SOLANA_WALLET_AUTH_ENABLED", "false"); expect(await getSolanaSession()).toBeNull(); expect(mocks.db).not.toHaveBeenCalled();
  });
  it("rejects malformed session tokens before storage", async () => {
    mocks.get.mockReturnValue({ value: "short" }); expect(await getSolanaSession()).toBeNull(); expect(mocks.db).not.toHaveBeenCalled();
  });
  it("queries the token hash and requires non-revoked, unexpired sessions", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await getSolanaSession()).toBeNull();
    expect(mocks.eq).toHaveBeenCalledWith("token_hash", digest(token));
    expect(mocks.is).toHaveBeenCalledWith("revoked_at", null);
    expect(mocks.gt).toHaveBeenCalledWith("expires_at", expect.any(String));
  });
  it("rejects a banned or missing identity even with a valid session record", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: { wallet_address: "wallet", expires_at: "future" }, error: null }).mockResolvedValueOnce({ data: null, error: null });
    expect(await getSolanaSession()).toBeNull(); expect(mocks.eq).toHaveBeenCalledWith("banned", false);
  });
  it("returns only isolated wallet identity without legacy user roles or balances", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: { wallet_address: "wallet", expires_at: "future" }, error: null }).mockResolvedValueOnce({ data: { wallet_address: "wallet" }, error: null });
    expect(await getSolanaSession()).toEqual({ wallet: "wallet", expiresAt: "future" });
  });
  it("fails closed when storage is unavailable", async () => { mocks.db.mockReturnValue(null); expect(await getSolanaSession()).toBeNull(); });
});
describe("wallet session revocation", () => {
  it("rejects cross-origin logout before any storage or cookie mutation", async () => {
    expect((await logout(request("https://attacker.invalid"))).status).toBe(403); expect(mocks.db).not.toHaveBeenCalled(); expect(mocks.set).not.toHaveBeenCalled();
  });
  it("preserves the cookie for retry when revocation fails", async () => {
    mocks.eq.mockResolvedValue({ error: { message: "unavailable" } }); expect((await logout(request())).status).toBe(503); expect(mocks.set).not.toHaveBeenCalled();
  });
  it("revokes the hashed token before clearing session and challenge cookies", async () => {
    mocks.eq.mockResolvedValue({ error: null }); expect((await logout(request())).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({ revoked_at: expect.any(String) }); expect(mocks.eq).toHaveBeenCalledWith("token_hash", digest(token));
    expect(mocks.set).toHaveBeenCalledWith("gp-solana-session", "", expect.objectContaining({ httpOnly: true, sameSite: "lax", maxAge: 0, path: "/" }));
    expect(mocks.set).toHaveBeenCalledWith("gp-solana-challenge", "", expect.objectContaining({ httpOnly: true, sameSite: "lax", maxAge: 0, path: "/" }));
  });
});
