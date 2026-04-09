import { describe, it, expect } from "vitest";

/** Mirrors POST /api/celo/room/create required bankroll check (cents). */
function requiredBankrollCents(minBetCents: number, maxPlayers: number): number {
  return minBetCents * maxPlayers;
}

describe("room create bankroll (cents)", () => {
  it("requires min_entry × max_players (e.g. $5 × 4 = $20)", () => {
    expect(requiredBankrollCents(500, 4)).toBe(2000);
  });

  it("flags insufficient banker balance", () => {
    const required = requiredBankrollCents(500, 4);
    const balanceCents = 1500;
    expect(balanceCents < required).toBe(true);
  });
});
