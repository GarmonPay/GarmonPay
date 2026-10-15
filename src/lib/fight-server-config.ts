/** Server-side configuration resolver. Never import this module in a client component. */
type FightServerUrls = { http?: string; arena?: string; boxing?: string };
/** Resolve public configuration only. A 200 response cannot certify a worker. */
export function getFightServerHealthUrl(urls: FightServerUrls = {
  http: process.env.NEXT_PUBLIC_FIGHT_SERVER_URL,
  arena: process.env.NEXT_PUBLIC_ARENA_WS_URL,
  boxing: process.env.NEXT_PUBLIC_BOXING_WS_URL,
}): string | undefined {
  for (const candidate of [urls.http, urls.boxing, urls.arena]) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if (url.username || url.password || url.search || url.hash || url.pathname !== "/") continue;
      if (!["https:", "wss:"].includes(url.protocol)) continue;
      url.protocol = "https:";
      return url.origin;
    } catch { /* Try the next configured origin. */ }
  }
  return undefined;
}
