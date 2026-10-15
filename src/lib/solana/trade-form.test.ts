import { describe, expect, it } from "vitest";
import { SELL_TEST_AMOUNTS, assertPriceImpactAllowed, buyAmountChoices, parseSlippagePercent, percentOfRaw, priceImpactDecision, rawToDecimal, slippageWarning, suggestedBuySol, toRawUnits } from "./trade-form";

describe("trade form amounts", () => {
  it("suggests the smallest Devnet buy and does not fill the remaining curve", () => {
    expect(suggestedBuySol("1000000")).toBe("0.00001");
    expect(suggestedBuySol("400000")).toBe("0.00001");
    expect(suggestedBuySol("9999")).toBe("");
    expect(suggestedBuySol("1000000")).not.toBe("0.05");
    const choices = buyAmountChoices("1000000");
    expect(choices.map(choice => choice.sol)).toEqual(["0.00001", "0.00005"]);
    expect(choices.every(choice => !choice.disabled)).toBe(true);
    expect(buyAmountChoices("40000").find(choice => choice.sol === "0.00005")?.disabled).toBe(true);
    expect(buyAmountChoices("1", false).every(choice => !choice.disabled)).toBe(true);
  });

  it("warns at 1% price impact and blocks 5% or more", () => {
    expect(priceImpactDecision("0.97%")).toMatchObject({ level: "ok", blocked: false });
    expect(priceImpactDecision("1.48%")).toMatchObject({ level: "high", blocked: false });
    expect(priceImpactDecision("-0.04%")).toMatchObject({ level: "ok", blocked: false });
    expect(priceImpactDecision("4.99%")).toMatchObject({ level: "high", blocked: false });
    expect(priceImpactDecision("5.00%").blocked).toBe(true);
    expect(priceImpactDecision("5.02%").blocked).toBe(true);
    expect(priceImpactDecision("18.40%").blocked).toBe(true);
    expect(priceImpactDecision(null).blocked).toBe(true);
    expect(() => assertPriceImpactAllowed("1.48%")).not.toThrow();
    expect(() => assertPriceImpactAllowed("4.99%")).not.toThrow();
    expect(() => assertPriceImpactAllowed("5.00%")).toThrow(/5\.00% Devnet limit/);
    expect(() => assertPriceImpactAllowed("5.02%")).toThrow(/5\.00% Devnet limit/);
    expect(() => assertPriceImpactAllowed(null)).toThrow(/could not be calculated/);
    expect(SELL_TEST_AMOUNTS).toEqual(["1", "10", "100"]);
    expect(SELL_TEST_AMOUNTS.includes("100")).toBe(true);
    expect(percentOfRaw("7931000000000", 100, 6)).not.toBe(SELL_TEST_AMOUNTS[0]);
  });

  it("validates slippage presets and custom values separately from fees", () => {
    expect(parseSlippagePercent("0.5")).toEqual({ bps: 50 });
    expect(parseSlippagePercent("1")).toEqual({ bps: 100 });
    expect(parseSlippagePercent("2")).toEqual({ bps: 200 });
    expect(parseSlippagePercent("0.09")).toEqual({ error: "Slippage must be from 0.10% to 10%." });
    expect(parseSlippagePercent("11")).toEqual({ error: "Slippage must be from 0.10% to 10%." });
    expect(slippageWarning(100)).toBe("");
    expect(slippageWarning(500)).toMatch(/separate from the trading fees/);
    expect(toRawUnits("0.0005", 9)).toBe("500000");
    expect(rawToDecimal("315", 9)).toBe("0.000000315");
    expect(toRawUnits("0.000000315", 9)).toBe("315");
    expect(toRawUnits(rawToDecimal("310", 9), 9)).toBe("310");
    expect(toRawUnits(rawToDecimal("1", 9), 9)).toBe("1");
    expect(toRawUnits("0.000000315", 9)).not.toBe("0");
  });

  it("turns a token balance into 25, 50, 75, and 100 percent sell amounts", () => {
    expect(percentOfRaw("4000000", 25, 6)).toBe("1");
    expect(percentOfRaw("4000000", 50, 6)).toBe("2");
    expect(percentOfRaw("4000000", 75, 6)).toBe("3");
    expect(percentOfRaw("4000000", 100, 6)).toBe("4");
    expect(percentOfRaw("0", 100, 6)).toBe("");
    expect(percentOfRaw("3", 25, 6)).toBe("");
  });
});
