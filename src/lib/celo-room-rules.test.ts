import { describe, expect, it } from "vitest";
import { buildCeloRoomRulesPatch } from "./celo-room-rules";

describe("buildCeloRoomRulesPatch", () => {
  it("writes only the existing room-rule columns", () => {
    const result = buildCeloRoomRulesPatch({
      name: "  High Table  ",
      minimumEntrySc: 1000,
      maxPlayers: 6,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.patch).toEqual({
      name: "High Table",
      minimum_entry_sc: 1000,
      min_bet_cents: 1000,
      max_players: 6,
    });
    expect(result.patch).not.toHaveProperty("current_bank_sc");
    expect(result.patch).not.toHaveProperty("current_bank_cents");
    expect(result.patch).not.toHaveProperty("bank_busted");
    expect(result.patch).not.toHaveProperty("banker_id");
    expect(result.patch).not.toHaveProperty("status");
  });

  it("rejects an empty name, a non-positive minimum, and a disallowed table size", () => {
    expect(buildCeloRoomRulesPatch({ name: "  ", minimumEntrySc: 500, maxPlayers: 6 }).ok).toBe(
      false
    );
    expect(buildCeloRoomRulesPatch({ name: "Table", minimumEntrySc: 0, maxPlayers: 6 }).ok).toBe(
      false
    );
    expect(buildCeloRoomRulesPatch({ name: "Table", minimumEntrySc: 500, maxPlayers: 3 }).ok).toBe(
      false
    );
  });
});
