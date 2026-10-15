/** Read-only Raydium LaunchLab directory. Never signs, quotes a trade, or labels a mint as a GarmonPay launch.
 * The documented GET /get/list operation accepts sort only. It has no quote-mint filter, so quote kind is labeled from mintB. */
export const RAYDIUM_LIST_ENDPOINT = "https://launch-mint-v1.raydium.io/get/list";
export const RAYDIUM_MINT_ENDPOINT = "https://launch-mint-v1.raydium.io/get/by/mints";
export const RAYDIUM_SEARCH_ENDPOINT = "https://launch-mint-v1.raydium.io/get/search";
const WRAPPED_SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SORTS = new Set(["new", "marketCap", "lastTrade", "hotToken"]);

export type RaydiumDirectoryToken = {
  mint: string;
  name: string;
  symbol: string;
  quote: "SOL" | "USDC" | "other";
  curveType: number | null;
  protocolTradeFeeRate: string | null;
  platformFeeRate: string | null;
  creatorFeeRate: string | null;
  finishingRate: string | null;
  imageUrl: string | null;
  reportedMarketCap: string | null;
  reportedVolume: string | null;
  reportedInitPrice: string | null;
  reportedEndPrice: string | null;
  migrateType: string | null;
  source: "raydium-launchlab";
  provenance: "external";
};

function text(value: unknown, max: number) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null;
}
function feeRate(value: unknown) {
  const raw = typeof value === "number" && Number.isSafeInteger(value) ? String(value) : value;
  return typeof raw === "string" && /^(0|[1-9][0-9]{0,6})$/.test(raw) ? raw : null;
}
function reported(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && /^(0|[1-9]\d{0,24})(\.\d{1,18})?$/.test(value)) return value;
  return null;
}
function httpsUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 300) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}
function quoteOf(mintB: unknown): "SOL" | "USDC" | "other" {
  return mintB === WRAPPED_SOL ? "SOL" : mintB === USDC ? "USDC" : "other";
}

/** Accept only the documented list shape. Drop incomplete rows instead of inventing fields. */
export function parseRaydiumDirectory(payload: unknown): RaydiumDirectoryToken[] {
  if (!payload || typeof payload !== "object" || !("data" in payload)) throw new Error("Invalid Raydium directory");
  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== "object" || !("rows" in data) || !Array.isArray((data as { rows?: unknown }).rows)) {
    throw new Error("Invalid Raydium directory");
  }
  const rows = (data as { rows: unknown[] }).rows.slice(0, 100);
  const seen = new Set<string>();
  const tokens: RaydiumDirectoryToken[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const mint = text(record.mint, 44);
    const name = text(record.name, 64);
    const symbol = text(record.symbol, 16);
    if (!mint || !MINT.test(mint) || !name || !symbol || seen.has(mint)) continue;
    const config = record.configInfo && typeof record.configInfo === "object" ? record.configInfo as Record<string, unknown> : {};
    const platform = record.platformInfo && typeof record.platformInfo === "object" ? record.platformInfo as Record<string, unknown> : {};
    const curveType = config.curveType;
    const finishing = record.finishingRate;
    seen.add(mint);
    tokens.push({
      mint, name, symbol,
      quote: quoteOf(record.mintB),
      curveType: typeof curveType === "number" && Number.isInteger(curveType) ? curveType : null,
      protocolTradeFeeRate: feeRate(config.tradeFeeRate),
      platformFeeRate: feeRate(platform.feeRate),
      creatorFeeRate: feeRate(platform.creatorFeeRate),
      finishingRate: reported(finishing),
      imageUrl: httpsUrl(record.imgUrl),
      reportedMarketCap: reported(record.marketCap),
      reportedVolume: reported(record.volumeU),
      reportedInitPrice: reported(record.initPrice),
      reportedEndPrice: reported(record.endPrice),
      migrateType: text(record.migrateType, 16),
      source: "raydium-launchlab",
      provenance: "external",
    });
  }
  return tokens.slice(0, 24);
}

export function raydiumSort(value: string | null) {
  return value && SORTS.has(value) ? value : "new";
}

export function raydiumQuery(value: unknown) {
  if (typeof value !== "string") return "";
  const query = value.replace(/[^\p{L}\p{N} ._-]/gu, "").trim().slice(0, 32);
  return query.length >= 2 ? query : "";
}

export async function fetchRaydiumDirectory(sort: string, fetchImpl: typeof fetch = fetch) {
  const endpoint = new URL(RAYDIUM_LIST_ENDPOINT);
  endpoint.searchParams.set("sort", raydiumSort(sort));
  endpoint.searchParams.set("size", "50");
  const response = await fetchImpl(endpoint, { cache: "no-store", headers: { Accept: "application/json", "User-Agent": "GarmonPay/1.0" } });
  if (!response.ok) throw new Error("Raydium directory unavailable");
  return parseRaydiumDirectory(await response.json());
}

export async function fetchRaydiumSearch(query: string, fetchImpl: typeof fetch = fetch) {
  const text = raydiumQuery(query);
  if (!text) throw new Error("Search text required");
  const endpoint = new URL(RAYDIUM_SEARCH_ENDPOINT);
  endpoint.searchParams.set("text", text);
  const response = await fetchImpl(endpoint, { cache: "no-store", headers: { Accept: "application/json", "User-Agent": "GarmonPay/1.0" } });
  if (!response.ok) throw new Error("Raydium search unavailable");
  return parseRaydiumDirectory(await response.json());
}

export function targetFeeMismatch(tokens: RaydiumDirectoryToken[]) {
  const rates = [...new Set(tokens.map(token => token.protocolTradeFeeRate).filter((rate): rate is string => !!rate))];
  const pairs = [...new Set(tokens.map(token => `${token.platformFeeRate ?? "unknown"}/${token.creatorFeeRate ?? "unknown"}`))];
  return {
    denominator: "1000000",
    reportedProtocolRates: rates,
    reportedPlatformCreatorRates: pairs,
    matchesGarmonPayTarget: false as const,
    note: "These are Raydium-reported protocol tradeFeeRate values only. They are not a verified 1% total or a 0.60/0.40 platform and creator split.",
  };
}
