/**
 * Meshy 3D asset paths (served from `public/assets/meshy/**`).
 * Game logic (damage, stamina, rounds, KO, AI) stays in `server/fight-server.js` — this module is visuals only.
 */

export const MESHY_PUBLIC_BASE = "/assets/meshy" as const;

export const MESHY_FIGHTERS = `${MESHY_PUBLIC_BASE}/fighters`;
export const MESHY_RINGS = `${MESHY_PUBLIC_BASE}/rings`;
export const MESHY_PROPS = `${MESHY_PUBLIC_BASE}/props`;
export const MESHY_SKINS = `${MESHY_PUBLIC_BASE}/skins`;

/** Committed photoreal fallback (see `public/models/README.md`). Replace with your Meshy export if desired. */
export const FALLBACK_FIGHTER_GLB = "/models/default-boxer.glb";

/** Optional premium ring GLB — add after export; scene falls back to procedural ring if missing/invalid. */
export const DEFAULT_RING_GLB = `${MESHY_RINGS}/arena-ring.glb`;

/** Known API / DB shape keys for Meshy or GLB URLs (checked in order). */
const MODEL_URL_KEYS = ["model_3d_url", "model_url", "glb_url", "meshy_glb_url"] as const;

/**
 * Extract first non-empty Meshy/GLB URL from a fighter-like object.
 * Returns `null` when there is no 3D asset — use 2D card UI or procedural 3D only.
 */
export function getFighterModelUrl(fighter: unknown): string | null {
  if (fighter == null || typeof fighter !== "object" || Array.isArray(fighter)) return null;
  const f = fighter as Record<string, unknown>;
  for (const k of MODEL_URL_KEYS) {
    const v = f[k];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}

/** Safe URL for GLTF loader, or `null` if absent — avoids fetching a bogus default. */
export function resolveModelUrlOrNull(url: string | null | undefined): string | null {
  const u = typeof url === "string" ? url.trim() : "";
  return u.length > 0 ? u : null;
}

/**
 * Legacy: resolve to a GLB path string, defaulting to `FALLBACK_FIGHTER_GLB` when empty.
 * Prefer `resolveModelUrlOrNull` + explicit fallback when you want to skip network load.
 */
export function resolveFighterModelUrl(url: string | null | undefined): string {
  return resolveModelUrlOrNull(url) ?? FALLBACK_FIGHTER_GLB;
}

export function isRemoteModelUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}
