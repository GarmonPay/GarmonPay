import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/solana/policy", () => ({ walletAuthEnabled: () => true }));
import { POST } from "@/app/api/solana/auth/event/route";
import { sanitizeAuthEvent } from "./auth-event";

const leaked = { wallet: "LEAKED_ADDRESS", signature: "LEAKED_SIGNATURE", email: "leaked@example.com", token: "LEAKED_TOKEN" };

function request(body: unknown, ip = "203.0.113.44") {
  return new Request("https://garmonpay.com/api/solana/auth/event", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://garmonpay.com", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

describe("Client auth events", () => {
  beforeEach(()=>vi.stubEnv("NEXT_PUBLIC_SITE_URL","https://garmonpay.com"));
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it("strips forbidden fields before anything is logged", async () => {
    const clean = sanitizeAuthEvent({ stage: "provider-check", ok: false, code: "TIMEOUT", uaFamily: "ios", insideWallet: true, hasHint: false, providerFound: false, elapsedMs: 1200, ...leaked });
    expect(clean).toEqual({ stage: "provider-check", ok: false, code: "TIMEOUT", uaFamily: "ios", insideWallet: true, hasHint: false, providerFound: false, elapsedMs: 1200 });
    expect(JSON.stringify(clean)).not.toContain("LEAKED_");
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const response = await POST(request({ stage: "connect-fail", ok: false, code: "TIMEOUT", uaFamily: "ios", insideWallet: true, hasHint: true, providerFound: true, elapsedMs: 30, ...leaked }));
    expect(response.status).toBe(200);
    const logged = spy.mock.calls.map(call => JSON.stringify(call)).join("\n");
    expect(logged).toContain("[garmonpay-auth-client]");
    expect(logged).toContain("connect-fail");
    expect(logged).not.toContain("LEAKED_");
    expect(logged).not.toContain("leaked@example.com");
  });

  it("rate limits a single address", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const body = { stage: "page-load", ok: true, code: "", uaFamily: "ios", insideWallet: true, hasHint: false, providerFound: false, elapsedMs: 0 };
    let last = 200;
    for (let attempt = 0; attempt < 61; attempt += 1) last = (await POST(request(body, "203.0.113.45"))).status;
    expect(last).toBe(429);
  });
});
