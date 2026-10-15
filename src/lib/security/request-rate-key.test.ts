import { describe, expect, it } from "vitest";
import { requestRateLimit } from "./request-rate-key";

describe("auth request limits", () => {
  it("lets session checks exceed the sign-in write limit", () => {
    expect(requestRateLimit("/api/solana/auth/session", "GET")).toEqual({ key: "solana-session-read", limit: 120 });
    expect(requestRateLimit("/api/solana/auth/challenge", "POST")?.limit).toBe(10);
    expect(requestRateLimit("/api/solana/auth/verify", "POST")?.key).not.toBe(requestRateLimit("/api/solana/auth/session", "GET")?.key);
    expect(requestRateLimit("/api/solana/auth/event", "POST")).toBeNull();
  });
});
