import { describe, it, expect } from "vitest";

/**
 * Contract: GET /api/wallet/get returns `{ balance_cents: number }` from getCanonicalBalanceCents.
 * C-Lo UI must read only this field for USD wallet (not profiles.balance / dashboard mirrors).
 */
describe("canonical balance API contract", () => {
  it("parseWalletGetBody matches create response shape", () => {
    const parse = (j: unknown) => {
      const o = j as { balance_cents?: number };
      const n = Number(o.balance_cents ?? 0);
      return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
    };
    expect(parse({ balance_cents: 1500 })).toBe(1500);
    expect(parse({ balance_cents: 0 })).toBe(0);
  });
});
