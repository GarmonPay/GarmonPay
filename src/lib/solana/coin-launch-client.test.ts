import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseCoinSuggestion } from "./coin-suggestions";
import { coinJson, coinOperation, validateCoinDraft } from "./coin-launch-client";
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const suggested = parseCoinSuggestion({ name: "Garmon Glow", symbol: "glow", description: "A purple and gold community." }, ["name", "symbol", "description"]);
describe("AI-to-launch validation and bounded operations", () => {
  it("accepts the actual suggestion parser output immediately without manual edits", () => {
    expect(validateCoinDraft({ ...suggested, website: "", social: "" })).toMatchObject({ name: "Garmon Glow", symbol: "GLOW", description: "A purple and gold community." });
    expect(validateCoinDraft({ name: " Garmon Glow ", symbol: "glow", description: suggested.description })).toMatchObject({ name: "Garmon Glow", symbol: "GLOW" });
  });
  it.each([{ name: "" }, { symbol: "BAD!" }, { description: "" }, { name: "x".repeat(33) }, { website: "http://unsafe.test" }])("rejects invalid drafts before connecting the wallet: %j", changed => {
    expect(() => validateCoinDraft({ ...suggested, ...changed })).toThrow();
  });
  it("times out a hung wallet and ignores its late signature instead of submitting", async () => {
    vi.useFakeTimers();
    let finish!: (value: string) => void;
    const send = vi.fn();
    const pending = coinOperation(() => new Promise<string>(resolve => { finish = resolve; }), "signature", undefined, 50).then(send);
    const check = expect(pending).rejects.toThrow(/Close the old wallet request/);
    await vi.advanceTimersByTimeAsync(50); await check;
    finish("late-signed-result"); await Promise.resolve();
    expect(send).not.toHaveBeenCalled();
  });
  it("cancels preparation and does not start an already-aborted wallet request", async () => {
    const control = new AbortController(); const connect = vi.fn(); control.abort();
    await expect(coinOperation(connect, "connection", control.signal)).rejects.toThrow(/Cancelled/);
    expect(connect).not.toHaveBeenCalled();
  });
  it("expires an unattended cost review instead of keeping Launch busy", async () => {
    vi.useFakeTimers();
    const pending = coinOperation(() => new Promise(() => {}), "review", undefined, 60);
    const check = expect(pending).rejects.toThrow(/Cost review expired/);
    await vi.advanceTimersByTimeAsync(60); await check;
  });
  it("aborts stalled fetches and distinguishes preparation from uncertain submission", async () => {
    vi.useFakeTimers(); const signals: AbortSignal[] = [];
    vi.stubGlobal("fetch", vi.fn((_url, options) => { signals.push(options.signal); return new Promise(() => {}); }));
    const prepare = coinJson("/test", {}, "preparation"); const first = expect(prepare).rejects.toThrow(/Nothing was submitted/);
    await vi.advanceTimersByTimeAsync(45000); await first; expect(signals[0].aborted).toBe(true);
    const submit = coinJson("/test", {}, "submission"); const second = expect(submit).rejects.toThrow(/may have been sent/);
    await vi.advanceTimersByTimeAsync(75000); await second; expect(signals[1].aborted).toBe(true);
  });
  it("keeps Create Coin off the browser vanity grind", () => {
    const source = readFileSync(new URL("../../components/solana/CreateCoin.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("findGpayMint");
    expect(source).not.toContain("faster device");
    expect(source).not.toContain("gpay");
    expect(source).not.toContain("mint search");
    expect(source).toContain("mint-start");
    expect(source).toContain("Preparing the Devnet transaction.");
  });
  it.each(["suggestion", "preparation", "submission"] as const)("labels %s network failures and never silently hangs", async phase => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(coinJson("/test", {}, phase)).rejects.toThrow(phase === "suggestion" ? /AI suggestion network/ : phase === "preparation" ? /Devnet preparation network/ : /submission\/confirmation network/);
  });
  it("rejects malformed responses with an actionable phase-specific message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("null")));
    await expect(coinJson("/test", {}, "preparation")).rejects.toThrow(/Devnet preparation returned an unreadable response/);
  });
});
