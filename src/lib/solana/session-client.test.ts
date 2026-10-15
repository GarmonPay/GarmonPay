import { describe, expect, it, vi } from "vitest";
import { classifySessionResponse, readWalletSession } from "./session-client";

describe("wallet session reads", () => {
  it("keeps an absent cookie separate from a temporary lookup failure", () => {
    expect(classifySessionResponse(401, { wallet: null })).toEqual({ state: "anonymous" });
    expect(classifySessionResponse(200, { wallet: "93SDwallet", expiresAt: "later" })).toEqual({ state: "active", wallet: "93SDwallet" });
    expect(classifySessionResponse(429, { message: "Too Many Requests" })).toEqual({ state: "temporary", status: 429 });
    expect(classifySessionResponse(503, { error: "Profiles unavailable" })).toEqual({ state: "temporary", status: 503 });
    expect(classifySessionResponse(0, null)).toEqual({ state: "temporary", status: 0 });
  });

  it("retries a rate-limited session read and then accepts the member", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: "Too Many Requests" }), { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ wallet: "93SDwallet" }), { status: 200 }));
    await expect(readWalletSession(request, async () => {})).resolves.toEqual({ state: "active", wallet: "93SDwallet" });
    expect(request).toHaveBeenCalledTimes(2);
  });
});
