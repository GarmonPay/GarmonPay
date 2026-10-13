import { describe, expect, it } from "vitest";
import { AUTH_STAGE_ERRORS, inAppDecision, pollProvider, signedInNotice } from "./in-app-sign-in";

describe("In-Phantom sign-in waits for the provider and does not connect by itself", () => {
  it("sees a provider immediately, after 1200ms, or not at all", async () => {
    let waits = 0;
    await expect(pollProvider({ read: () => ({ phantom: true, solflare: false }), wait: async () => { waits += 1; }, clock: () => 0 })).resolves.toBe("phantom");
    expect(waits).toBe(0);
    let now = 0;
    await expect(pollProvider({
      read: () => ({ phantom: now >= 1200, solflare: false }),
      wait: async (ms) => { now += ms; },
      clock: () => now,
    })).resolves.toBe("phantom");
    expect(now).toBe(1250);
    now = 0;
    await expect(pollProvider({
      read: () => ({ phantom: false, solflare: false }),
      wait: async (ms) => { now += ms; },
      clock: () => now,
    })).resolves.toBe("timeout");
    expect(now).toBe(5000);
  });

  it("keeps the sign-in offer inside Phantom when the hint is present or missing", () => {
    expect(inAppDecision({ hint: "phantom", insideWallet: true, surface: "iphone", phantom: true, solflare: false, hasSession: false })).toBe("sign-phantom");
    expect(inAppDecision({ hint: null, insideWallet: true, surface: "iphone", phantom: true, solflare: false, hasSession: false })).toBe("sign-phantom");
    expect(inAppDecision({ hint: "phantom", insideWallet: true, surface: "iphone", phantom: false, solflare: false, hasSession: false })).toBe("wait");
    expect(inAppDecision({ hint: null, insideWallet: true, surface: "iphone", phantom: false, solflare: false, hasSession: false })).toBe("wait");
    expect(inAppDecision({ hint: null, insideWallet: false, surface: "iphone", phantom: false, solflare: false, hasSession: false })).toBe("none");
    expect(inAppDecision({ hint: null, insideWallet: true, surface: "desktop", phantom: true, solflare: false, hasSession: false })).toBe("none");
  });

  it("shows a distinct message for each failed stage and after a Phantom profile loads", () => {
    expect(AUTH_STAGE_ERRORS.provider).toBe("Phantom wallet not detected. Close and reopen this page in Phantom.");
    expect(AUTH_STAGE_ERRORS.connect).toBe("Phantom rejected the connection request.");
    expect(AUTH_STAGE_ERRORS.sign).toBe("Phantom rejected the sign-in message.");
    expect(AUTH_STAGE_ERRORS.verify).toBe("Signature verification failed.");
    expect(AUTH_STAGE_ERRORS.session).toBe("The signature was approved, but the sign-in session was not created.");
    expect(AUTH_STAGE_ERRORS.profile).toBe("Your session was created, but the member profile could not be loaded.");
    expect(signedInNotice("phantom", true)).toBe("Signed in. You are signed in inside Phantom's browser. Safari stays separate.");
    expect(signedInNotice("phantom", false)).toBe("");
    expect(signedInNotice("solflare", true)).toBe("");
  });
});
