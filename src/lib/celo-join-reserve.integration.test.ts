import { describe, it, expect } from "vitest";
import { assertSumStakesWithinReserve } from "@/lib/celo-banker-reserve";

/**
 * Narrow integration-style checks for POST /api/celo/room/join reserve gate
 * (same predicates as the route; no HTTP/DB).
 */
describe("join reserve gate (integration-style)", () => {
  it("rejects when existing stakes + new entry exceed reserve", () => {
    const r = assertSumStakesWithinReserve({
      reserveCents: 10_000,
      sumStakesCents: 8_000 + 3_000,
      messageWhenExceeded: "join",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe("join");
  });

  it("allows join at exact reserve", () => {
    expect(
      assertSumStakesWithinReserve({ reserveCents: 5000, sumStakesCents: 2500 + 2500 }).ok
    ).toBe(true);
  });
});
