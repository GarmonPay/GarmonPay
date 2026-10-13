import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/solana/auth/event/route";

describe("Auth event route while wallet authentication is disabled", () => {
  it("does not accept client events", async () => {
    const response = await POST(new Request("https://garmonpay.com/api/solana/auth/event", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://garmonpay.com" },
      body: JSON.stringify({ stage: "page-load", ok: true, uaFamily: "ios", insideWallet: false, hasHint: false, providerFound: false, elapsedMs: 0 }),
    }));
    expect(response.status).toBe(503);
  });
});
