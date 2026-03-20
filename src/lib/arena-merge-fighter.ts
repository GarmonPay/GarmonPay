import { getFighterModelUrl } from "@/lib/meshy-assets";

/**
 * Merge socket/API fighter payloads without stripping Meshy URLs.
 * Root bug: socket `fight_state` used to send minimal fighter objects without `model_3d_url`,
 * overwriting richer data from GET `/api/arena/fights/:id`.
 */
export function mergeArenaFighterPayload<T extends Record<string, unknown>>(
  prev: T | null,
  incoming: Partial<T> | null | undefined
): T | null {
  if (incoming == null || typeof incoming !== "object") return prev;
  if (prev == null) return { ...incoming } as T;
  const merged = { ...prev, ...incoming } as T;
  const prevUrl = getFighterModelUrl(prev);
  const incUrl = getFighterModelUrl(incoming as Record<string, unknown>);
  if (prevUrl && !incUrl) {
    for (const k of ["model_3d_url", "model_url", "glb_url", "meshy_glb_url"] as const) {
      if (prev[k] != null) (merged as Record<string, unknown>)[k] = prev[k];
    }
  }
  return merged;
}

/** Dev-only: log missing fields that often cause arena UI issues. */
export function logArenaFighterPayload(context: string, fighter: unknown): void {
  if (process.env.NODE_ENV !== "development") return;
  if (fighter == null || typeof fighter !== "object") {
    console.warn(`[Arena] ${context}: fighter is not an object`, fighter);
    return;
  }
  const f = fighter as Record<string, unknown>;
  const id = f.id;
  const name = f.name;
  const url = getFighterModelUrl(f);
  if (id == null) console.warn(`[Arena] ${context}: fighter.id missing`, f);
  if (name == null) console.warn(`[Arena] ${context}: fighter.name missing`, f);
  if (f.avatar === undefined) {
    console.warn(`[Arena] ${context}: fighter.avatar undefined (optional)`, f);
  }
  console.log(`[Arena] ${context}:`, { id, name, modelUrl: url ?? "(none)", keys: Object.keys(f) });
}
