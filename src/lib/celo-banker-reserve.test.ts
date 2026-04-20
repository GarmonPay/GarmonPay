import { describe, it, expect } from "vitest";
import {
  assertSumStakesWithinReserve,
  sumPlayerTableStakesCents,
  totalCommittedAfterStakeReplacement,
} from "@/lib/celo-banker-reserve";

describe("sumPlayerTableStakesCents", () => {
  it("sums entry_sc for players", () => {
    expect(sumPlayerTableStakesCents([{ entry_sc: 1500 }])).toBe(1500);
    expect(sumPlayerTableStakesCents([{ entry_sc: 2000 }, { entry_sc: 500 }])).toBe(2500);
    expect(sumPlayerTableStakesCents([{ entry_sc: 500 }, { entry_sc: 500 }])).toBe(1000);
  });
});

describe("totalCommittedAfterStakeReplacement", () => {
  it("replaces one player stake in the total", () => {
    expect(
      totalCommittedAfterStakeReplacement({
        totalCommittedAllPlayers: 2500,
        previousStakeThisPlayer: 500,
        newStakeThisPlayer: 3000,
      })
    ).toBe(5000);
  });
});

describe("assertSumStakesWithinReserve", () => {
  it("allows sum at cap", () => {
    expect(assertSumStakesWithinReserve({ reserveCents: 10000, sumStakesCents: 10000 }).ok).toBe(true);
  });

  it("rejects sum above reserve", () => {
    const r = assertSumStakesWithinReserve({ reserveCents: 1000, sumStakesCents: 1001 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message.length).toBeGreaterThan(10);
  });

  it("uses custom message when exceeded", () => {
    const r = assertSumStakesWithinReserve({
      reserveCents: 100,
      sumStakesCents: 200,
      messageWhenExceeded: "custom",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBe("custom");
  });
});
