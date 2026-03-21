/**
 * Defensive helpers for arena fighter objects (API/socket payloads may be partial).
 */

export function safeFighterColor(fighter: unknown, fallback = "#f0a500"): string {
  if (fighter == null || typeof fighter !== "object" || Array.isArray(fighter)) return fallback;
  const c = (fighter as Record<string, unknown>).fighter_color;
  return typeof c === "string" && c.trim().length > 0 ? c : fallback;
}

export function safeBarNumber(n: unknown, fallback = 0): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return n;
}

export function safeDisplayName(name: unknown, fallback: string): string {
  if (typeof name === "string" && name.trim().length > 0) return name.trim();
  return fallback;
}
