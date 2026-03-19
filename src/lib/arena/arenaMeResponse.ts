import type { FighterData } from "@/lib/arena-fighter-types";
import { normalizeFighterStats } from "@/lib/arena-fighter-types";

/** Safe parse of GET /api/arena/me JSON — normalizes fighter.stats so no undefined access; never throws. */
export function parseArenaMeResponse(data: unknown): {
  fighter: FighterData | null;
  arenaCoins: number | undefined;
  freeGenerationUsed: boolean | undefined;
} {
  const base = {
    fighter: null as FighterData | null,
    arenaCoins: undefined as number | undefined,
    freeGenerationUsed: undefined as boolean | undefined,
  };
  if (data == null || typeof data !== "object" || Array.isArray(data)) {
    if (process.env.NODE_ENV === "development") console.warn("[Arena] Invalid /arena/me response (not an object)");
    return base;
  }
  const d = data as Record<string, unknown>;
  if (typeof d.arenaCoins === "number") base.arenaCoins = d.arenaCoins;
  if (d.freeGenerationUsed === true) base.freeGenerationUsed = true;
  const f = d.fighter;
  if (f != null && typeof f === "object" && !Array.isArray(f)) {
    try {
      const normalized = normalizeFighterStats(f as Record<string, unknown>) as unknown as FighterData;
      base.fighter = normalized;
      if (process.env.NODE_ENV === "development") console.log("[Arena] fighter (normalized):", normalized?.name, normalized?.stats);
    } catch (e) {
      if (process.env.NODE_ENV === "development") console.warn("[Arena] normalize fighter failed", e);
    }
    return base;
  }
  if (process.env.NODE_ENV === "development") console.warn("[Arena] Fighter not found in API response");
  return base;
}

/** Minimal fighter row for 2D ring when API returns partial opponent data. Always includes normalized stats. */
export function toSafeFighterData(partial: Record<string, unknown> | FighterData | null | undefined): FighterData {
  const p =
    partial != null && typeof partial === "object" && !Array.isArray(partial)
      ? (partial as Record<string, unknown>)
      : {};
  const normalized = normalizeFighterStats(p);
  return {
    ...(p as FighterData),
    ...normalized,
    id: String(p.id ?? ""),
    name: String(p.name ?? "Fighter"),
    style: String(p.style ?? "boxer"),
    avatar: String(p.avatar ?? "🥊"),
    body_type: (p.body_type as FighterData["body_type"]) ?? "middleweight",
    skin_tone: (p.skin_tone as FighterData["skin_tone"]) ?? "tone3",
    equipped_gloves: String(p.equipped_gloves ?? "default"),
    equipped_shorts: String(p.equipped_shorts ?? "default"),
    equipped_shoes: String(p.equipped_shoes ?? "default"),
    equipped_headgear: (p.equipped_headgear != null ? String(p.equipped_headgear) : "none") as FighterData["equipped_headgear"],
  };
}
