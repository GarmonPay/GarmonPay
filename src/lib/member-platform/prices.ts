const IDS: Record<string, string> = { SOL: "solana", BTC: "bitcoin", ETH: "ethereum" };

export type LivePrice = { symbol: string; microusd: string; source: string; observedAt: number };

/** Public spot price. Missing or unreadable quotes are refused rather than estimated. */
export async function lookupUsdPrice(symbol: string, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<LivePrice | null> {
  const key = symbol.trim().toUpperCase();
  const id = IDS[key];
  if (!id) return null;
  try {
    const response = await fetchImpl(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return null;
    const body = await response.json() as Record<string, { usd?: unknown }>;
    const usd = body?.[id]?.usd;
    if (typeof usd !== "number" || !Number.isFinite(usd) || usd <= 0 || usd > 10_000_000) return null;
    const microusd = BigInt(Math.round(usd * 1_000_000)).toString();
    if (!/^[1-9][0-9]{0,14}$/.test(microusd)) return null;
    return { symbol: key, microusd, source: "coingecko", observedAt: now };
  } catch {
    return null;
  }
}
