import { describe, expect, it } from "vitest";
import { reviewLaunchConfiguration, reviewLaunchIntent, validateLaunchCostQuote } from "./launch-config";

const config = {
  currency: "SOL", curve: "virtual_constant_product", stage: "curve",
  fees: { denominator: "1000000", protocol: "2500", platform: "12000", creator: "3000", creatorClaim: "0" },
};
const binding = { cluster: "synthetic-local", mint: "synthetic-mint", creator: "synthetic-creator", platform: "synthetic-platform", config: "synthetic-config" };
const quote = {
  currency: "SOL", binding, observedAt: 1000, expiresAt: 61000,
  costs: { launch: "50000000", network: "5000", protocol: "0", accountRent: "2000000", initialBuy: "0" },
  totalLamports: "52005000",
};

describe("launch configuration arithmetic review", () => {
  it("recognizes only a hypothetical exact target without certifying deployment", () => {
    expect(reviewLaunchConfiguration(config)).toMatchObject({ compatible: true, totalFeeRate: "17500" });
  });
  it("blocks additive protocol fees rather than reducing the promised shares", () => {
    expect(reviewLaunchConfiguration({ ...config, fees: { ...config.fees, protocol: "10000" } })).toMatchObject({ compatible: false, totalFeeRate: "25000" });
  });
  it.each([
    { currency: "USDC" }, { curve: "linear" }, { stage: "graduated" },
    { fees: { ...config.fees, creatorClaim: "1" } },
    { fees: { ...config.fees, platform: "11999", creator: "3001" } },
  ])("blocks unsupported economics or lifecycle %j", change => {
    expect(reviewLaunchConfiguration({ ...config, ...change }).compatible).toBe(false);
  });
  it.each([undefined, null, {}, { ...config, stage: "unknown" },
    { ...config, fees: { ...config.fees, denominator: "10000" } },
    ...["-1", "1.5", "NaN", "010000", "1000001"].map(protocol => ({ ...config, fees: { ...config.fees, protocol } })),
  ])("rejects incomplete or malformed config %j", input => {
    expect(() => reviewLaunchConfiguration(input)).toThrow();
  });
});

describe("complete bound cost previews", () => {
  it("conserves every disclosed cost component", () => {
    expect(validateLaunchCostQuote(quote, binding, 1000).totalLamports).toBe("52005000");
  });
  it.each([
    { costs: { ...quote.costs, network: null } }, { costs: { ...quote.costs, protocol: undefined } },
    { costs: { ...quote.costs, hiddenFee: "1" } }, { totalLamports: null }, { totalLamports: "50000000" },
    { costs: { ...quote.costs, launch: "50000001" }, totalLamports: "52005001" },
    { observedAt: 1001 }, { expiresAt: 1000 }, { expiresAt: 61001 }, { observedAt: NaN }, { observedAt: -1 },
    { currency: "USDC" }, { binding: { ...binding, mint: "different-mint" } },
  ])("rejects partial, stale or mismatched quote %j", change => {
    expect(() => validateLaunchCostQuote({ ...quote, ...change }, binding, 1000)).toThrow();
  });
  it("expires exactly at the deadline and rejects missing expected bindings", () => {
    expect(() => validateLaunchCostQuote(quote, binding, 61000)).toThrow();
    expect(() => validateLaunchCostQuote(quote, { ...binding, config: "" }, 1000)).toThrow();
  });
  it("keeps precision above Number.MAX_SAFE_INTEGER", () => {
    const large = { ...quote, costs: { ...quote.costs, initialBuy: "9007199254740993" }, totalLamports: "9007199306745993" };
    expect(validateLaunchCostQuote(large, binding, 1000).totalLamports).toBe(large.totalLamports);
  });
  it("never turns a validated metadata/config/quote preview into launch authorization", () => {
    expect(reviewLaunchIntent({ name: "Synthetic", symbol: "SYN", description: "Synthetic local test", website: "", social: "" }, config, quote, binding, 1000)).toMatchObject({ launchEnabled: false, requiresOnChainVerification: true, requiresTransactionSimulation: true });
  });
});
