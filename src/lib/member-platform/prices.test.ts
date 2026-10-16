import { describe, expect, it, vi } from "vitest";
import { lookupUsdPrice } from "./prices";

const now = 1_800_000_000_000;
const quote = (updated: unknown, usd: unknown = 150.25) => vi.fn(async () => Response.json({ solana: { usd, last_updated_at: updated } }));

describe("trusted paper price freshness", () => {
  it("uses provider timestamps and disables cached HTTP responses", async () => {
    const fetcher = quote(now / 1000 - 10);
    expect(await lookupUsdPrice("SOL", fetcher, now)).toEqual({ symbol: "SOL", microusd: "150250000", source: "coingecko", observedAt: now - 10_000 });
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("include_last_updated_at=true"), expect.objectContaining({ cache: "no-store" }));
  });
  it.each([undefined, "1800000000", now / 1000 + 1, now / 1000 - 61])("rejects missing, invalid, future or stale timestamps: %s", async (updated) => {
    expect(await lookupUsdPrice("SOL", quote(updated), now)).toBeNull();
  });
  it("rejects unsupported assets without fetching", async () => {
    const fetcher = quote(now / 1000);
    expect(await lookupUsdPrice("DOGE", fetcher, now)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([0, -1, "150", 10_000_001])("rejects invalid provider prices: %s", async (usd) => {
    expect(await lookupUsdPrice("SOL", quote(now / 1000, usd), now)).toBeNull();
  });
});
