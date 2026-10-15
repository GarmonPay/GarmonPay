import { describe, expect, it } from "vitest";
import { coinArtworkEnabled, coinSuggestionsEnabled, extractJsonObject, parseCoinSuggestion, parseCoinSuggestions } from "./coin-suggestions";
import { assessLaunchSubmission } from "./launch-readiness";
import { parseRaydiumDirectory, raydiumQuery, targetFeeMismatch } from "./raydium-directory";

const row = {
  mint: "So11111111111111111111111111111111111111112",
  name: "Sample",
  symbol: "SAM",
  mintB: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  finishingRate: 12.5,
  configInfo: { curveType: 0, tradeFeeRate: "2500" },
};

describe("external Raydium directory", () => {
  it("keeps external rows out of the GarmonPay launch contract", () => {
    const [token] = parseRaydiumDirectory({ data: { rows: [row, { mint: "bad", name: "X", symbol: "X" }] } });
    expect(token).toMatchObject({ quote: "USDC", provenance: "external", protocolTradeFeeRate: "2500", imageUrl: null });
    expect(parseRaydiumDirectory({ data: { rows: [{ ...row, imgUrl: "https://cdn.example/art.png", marketCap: 12.5, javascript: "javascript:alert(1)" }] } })[0].imageUrl).toBe("https://cdn.example/art.png");
    expect(raydiumQuery("so")).toBe("so");
    expect(raydiumQuery("a")).toBe("");
    expect(targetFeeMismatch([token])).toMatchObject({ matchesGarmonPayTarget: false, reportedPlatformCreatorRates: ["unknown/unknown"] });
    expect(() => parseRaydiumDirectory({ tokens: [] })).toThrow("Invalid Raydium directory");
  });
});

describe("coin suggestions", () => {
  it("stays off unless explicitly activated and rejects unusable model output", () => {
    expect(coinSuggestionsEnabled({})).toBe(false);
    expect(coinSuggestionsEnabled({ ANTHROPIC_API_KEY: "x".repeat(20) })).toBe(true);
    expect(coinArtworkEnabled()).toBe(false);
    expect(parseCoinSuggestion(extractJsonObject("```json\n{\"name\":\"Sample\",\"symbol\":\"sam\",\"description\":\"A draft\",\"keywords\":\"gold\"}\n```"), ["name", "symbol", "keywords"])).toMatchObject({ name: "Sample", symbol: "SAM", keywords: "gold", artworkAvailable: false });
    expect(() => parseCoinSuggestion({ name: "Sample", symbol: "!!!", description: "A draft" }, ["symbol"])).toThrow("Ticker");
    expect(parseCoinSuggestions([{ name: "One", symbol: "ONE", description: "First draft.", keywords: "one" }, { name: "One", symbol: "ONE", description: "First draft.", keywords: "one" }, { symbol: "!!!" }, { name: "Two", symbol: "TWO", description: "Second draft.", keywords: "two" }])).toHaveLength(2);
    expect(parseCoinSuggestions(extractJsonObject("```json\n[{\"name\":\"One\",\"symbol\":\"ONE\",\"description\":\"First draft.\",\"keywords\":\"one\"},{\"name\":\"Two\",\"symbol\":\"TWO\",\"description\":\"Second draft.\",\"keywords\":\"two\"}]\n```"))).toHaveLength(2);
    expect(assessLaunchSubmission()).toMatchObject({ launchEnabled: false, transactionBuilt: false, walletSigning: "paused" });
  });
});
