import { PAPER_ASSETS } from "./paper";
const IDS: Record<string, string> = { SOL: "solana", ...PAPER_ASSETS };

export type LivePrice = { symbol: string; microusd: string; source: string; observedAt: number };

/** Public spot price. Missing or unreadable quotes are refused rather than estimated. */
export async function lookupUsdPrice(symbol: string, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<LivePrice | null> {
  const key = symbol.trim().toUpperCase();
  const id = IDS[key];
  if (!id) return null;
  try {
    const response = await fetchImpl(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_last_updated_at=true`, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return null;
    const body = await response.json() as Record<string, { usd?: unknown; last_updated_at?: unknown }>;
    const usd = body?.[id]?.usd;
    if (typeof usd !== "number" || !Number.isFinite(usd) || usd <= 0 || usd > 10_000_000) return null;
    const updated = body?.[id]?.last_updated_at;
    if (typeof updated !== "number" || !Number.isFinite(updated) || updated * 1000 > now || now - updated * 1000 > 60_000) return null;
    const microusd = BigInt(Math.round(usd * 1_000_000)).toString();
    if (!/^[1-9][0-9]{0,14}$/.test(microusd)) return null;
    return { symbol: key, microusd, source: "coingecko", observedAt: updated * 1000 };
  } catch {
    return null;
  }
}
