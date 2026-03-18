import type { FighterData } from "@/lib/arena-fighter-types";

/** Safe parse of GET /api/arena/me JSON — logs fighter for debugging; never throws. */
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
    console.error("[Arena] Invalid /arena/me response (not an object):", data);
    return base;
  }
  const d = data as Record<string, unknown>;
  if (typeof d.arenaCoins === "number") base.arenaCoins = d.arenaCoins;
  if (d.freeGenerationUsed === true) base.freeGenerationUsed = true;
  const f = d.fighter;
  if (f != null && typeof f === "object" && !Array.isArray(f)) {
    console.log("[Arena] fighter data:", f);
    base.fighter = f as FighterData;
    return base;
  }
  console.error("[Arena] Fighter not found in API response", data);
  return base;
}

/** Minimal fighter row for 2D ring when API returns partial opponent data. */
export function toSafeFighterData(partial: Record<string, unknown> | FighterData | null | undefined): FighterData {
  const p =
    partial != null && typeof partial === "object" && !Array.isArray(partial)
      ? (partial as Record<string, unknown>)
      : {};
  return {
    ...(p as FighterData),
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
