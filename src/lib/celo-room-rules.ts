/** Room settings the takeover screen already edits. Funding is not a room rule. */

const MAX_PLAYERS = new Set([2, 4, 6, 10]);

export type CeloRoomRulesPatch = {
  name: string;
  minimum_entry_sc: number;
  min_bet_cents: number;
  max_players: number;
};

export function buildCeloRoomRulesPatch(input: {
  name: string;
  minimumEntrySc: number;
  maxPlayers: number;
}): { ok: true; patch: CeloRoomRulesPatch } | { ok: false; error: string } {
  const name = String(input.name ?? "").trim();
  const minimumEntrySc = Math.floor(Number(input.minimumEntrySc));
  const maxPlayers = Math.floor(Number(input.maxPlayers));

  if (!name) {
    return { ok: false, error: "name is required" };
  }
  if (name.length > 40) {
    return { ok: false, error: "name is too long" };
  }
  if (!Number.isFinite(minimumEntrySc) || minimumEntrySc <= 0) {
    return { ok: false, error: "minimum_entry_sc must be greater than 0" };
  }
  if (!MAX_PLAYERS.has(maxPlayers)) {
    return { ok: false, error: "max_players must be one of 2, 4, 6, or 10" };
  }

  return {
    ok: true,
    patch: {
      name,
      minimum_entry_sc: minimumEntrySc,
      min_bet_cents: minimumEntrySc,
      max_players: maxPlayers,
    },
  };
}
