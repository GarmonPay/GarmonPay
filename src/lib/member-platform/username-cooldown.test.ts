import { describe, expect, it } from "vitest";
import { USERNAME_COOLDOWN_MS, assertUsernameChange } from "./username-cooldown";

const wallet = "HLQyS1fLfboSvY5jwQwmpk394QfZhuWMZWmGZ2Bj7QUE";
const now = Date.parse("2026-10-16T12:00:00.000Z");

describe("wallet username cooldown", () => {
  it("keeps the current username and wallet when the handle is unchanged", () => {
    expect(assertUsernameChange({
      currentHandle: "ada", nextHandle: "ada", walletAddress: wallet, recordedWalletAddress: wallet, lastChangedAt: new Date(now).toISOString(), nowMs: now,
    })).toEqual({ changed: false });
    expect(assertUsernameChange({
      currentHandle: "ada", nextHandle: null, walletAddress: wallet, recordedWalletAddress: wallet, lastChangedAt: null, nowMs: now,
    })).toEqual({ changed: false });
  });

  it("allows the first recorded change and blocks another change for seven days", () => {
    expect(assertUsernameChange({
      currentHandle: "m_abc123", nextHandle: "ada", walletAddress: wallet, recordedWalletAddress: wallet, lastChangedAt: null, nowMs: now,
    })).toMatchObject({ changed: true, walletAddress: wallet });
    expect(() => assertUsernameChange({
      currentHandle: "ada", nextHandle: "bea", walletAddress: wallet, recordedWalletAddress: wallet, lastChangedAt: new Date(now - 1000).toISOString(), nowMs: now,
    })).toThrow(/seven|after/i);
    expect(assertUsernameChange({
      currentHandle: "ada", nextHandle: "bea", walletAddress: wallet, recordedWalletAddress: wallet,
      lastChangedAt: new Date(now - USERNAME_COOLDOWN_MS).toISOString(), nowMs: now,
    }).changed).toBe(true);
  });

  it("never treats a different wallet as the same member", () => {
    expect(() => assertUsernameChange({
      currentHandle: "ada", nextHandle: "bea", walletAddress: wallet, recordedWalletAddress: "3hJxH4AQYMf9rC45zSDDnFcMP4Ywqi2R9mKAKr3uaAKG", lastChangedAt: null, nowMs: now,
    })).toThrow(/wallet identity/);
  });
});
