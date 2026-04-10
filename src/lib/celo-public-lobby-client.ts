/** Client-only hint so `/games/celo` refetches after room mutations from `/games/celo/[id]`. */
const STALE_KEY = "garmon_celo_public_lobby_stale_v1";

export function markCeloPublicLobbyStale(): void {
  try {
    if (typeof window !== "undefined") sessionStorage.setItem(STALE_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function consumeCeloPublicLobbyStale(): boolean {
  try {
    if (typeof window === "undefined") return false;
    if (sessionStorage.getItem(STALE_KEY) !== "1") return false;
    sessionStorage.removeItem(STALE_KEY);
    return true;
  } catch {
    return false;
  }
}
