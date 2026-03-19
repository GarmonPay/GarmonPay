/**
 * Optional IP reputation check (VPN/proxy/datacenter).
 * Uses ip-api.com free tier (45 req/min). Fail-open if unavailable.
 */

export type IpReputationResult = {
  suspicious: boolean;
  proxy?: boolean;
  hosting?: boolean;
  error?: string;
};

const CACHE_MS = 5 * 60 * 1000; // 5 min per IP
const cache = new Map<string, { at: number; result: IpReputationResult }>();

function fromCache(ip: string): IpReputationResult | null {
  const entry = cache.get(ip);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_MS) {
    cache.delete(ip);
    return null;
  }
  return entry.result;
}

function toCache(ip: string, result: IpReputationResult): void {
  cache.set(ip, { at: Date.now(), result });
  if (cache.size > 500) {
    const entries = Array.from(cache.entries());
    const oldest = entries.sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }
}

/**
 * Check IP for proxy/hosting. Returns suspicious=true if proxy or hosting.
 * Non-blocking: on fetch error returns { suspicious: false }.
 */
export async function checkIpReputation(ip: string): Promise<IpReputationResult> {
  if (!ip || ip === "unknown" || ip.startsWith("127.") || ip === "::1") {
    return { suspicious: false };
  }
  const cached = fromCache(ip);
  if (cached !== null) return cached;

  try {
    const res = await fetch(
      `https://ip-api.com/json/${encodeURIComponent(ip)}?fields=proxy,hosting,message`,
      { signal: AbortSignal.timeout(3000) }
    );
    const data = (await res.json()) as { proxy?: boolean; hosting?: boolean; message?: string };
    const proxy = !!data?.proxy;
    const hosting = !!data?.hosting;
    const suspicious = proxy || hosting;
    const result: IpReputationResult = { suspicious, proxy, hosting };
    toCache(ip, result);
    return result;
  } catch (e) {
    const result: IpReputationResult = {
      suspicious: false,
      error: e instanceof Error ? e.message : "Unknown error",
    };
    toCache(ip, result);
    return result;
  }
}
