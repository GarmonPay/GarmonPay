const FIGHT_SERVER = process.env.NEXT_PUBLIC_FIGHT_SERVER_URL;

/** Base URL for fight server HTTP (health pings). Prefers NEXT_PUBLIC_FIGHT_SERVER_URL, else derives from WS URL. */
export function getFightServerHealthUrl(): string | undefined {
  if (FIGHT_SERVER) return FIGHT_SERVER;
  const ws = process.env.NEXT_PUBLIC_ARENA_WS_URL;
  if (!ws) return undefined;
  try {
    const u = new URL(ws);
    u.protocol = "https:";
    return u.origin;
  } catch {
    return undefined;
  }
}

export function startKeepAlive() {
  if (typeof window === "undefined") return;

  const base = getFightServerHealthUrl();
  if (!base) return;

  const ping = async () => {
    try {
      await fetch(`${base}/health`);
      console.log("Fight server alive");
    } catch (e) {
      console.log("Fight server ping failed");
    }
  };

  ping();
  setInterval(ping, 14 * 60 * 1000);
}
