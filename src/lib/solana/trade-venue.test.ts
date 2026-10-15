import { describe, expect, it } from "vitest";
import { bondingCurvePoints, classifyPoolActivity, classifyVaultMove, cpmmExecutionPoints, cpmmReserveValue, curveMarketValue, sumVaultVolume, tradingVolume } from "./devnet-market";
import { graduationFacts, tradeVenue } from "./trade-venue";

describe("graduation routing", () => {
  it("keeps an open bonding curve on LaunchLab and never sends it to CPMM", () => {
    expect(tradeVenue(0, false)).toBe("curve");
    expect(tradeVenue(0, true)).toBe("curve");
    expect(tradeVenue(1, true)).toBe("paused");
    expect(tradeVenue(2, false)).toBe("unavailable");
    expect(tradeVenue(2, true)).toBe("cpmm");
    expect(graduationFacts(0, null)).toMatchObject({ code: 0, label: "Bonding curve", migration: expect.stringMatching(/Not started/) });
    expect(graduationFacts(1, null).migration).toMatch(/Pending/);
    expect(graduationFacts(2, "rKDtk4T7gA1HBQfuoPetifrFUUtv4rVHGaUtJSXi97h")).toMatchObject({ code: 2, label: "Graduated", migration: expect.stringMatching(/Complete/) });
    expect(graduationFacts(2, null).migration).toMatch(/no Devnet CPMM/);
  });

  it("prices the curve from real reserves and classifies vault movement", () => {
    expect(curveMarketValue(BigInt(1000), BigInt(100), BigInt(100), BigInt(50), BigInt(1000), 6)).toMatchObject({
      lamportsPerToken: "166666",
      marketValueLamports: "166",
      liquidityLamports: "50",
    });
    expect(curveMarketValue(BigInt(10), BigInt(10), BigInt(10), BigInt(1), BigInt(10))).toBeNull();
    const fox = curveMarketValue(BigInt("10730259006683"), BigInt("352951"), BigInt("6243057679430"), BigInt("491062"), BigInt("10000000000000"), 6);
    expect(fox?.priceSol).toBe("0.000000000188");
    expect(fox?.marketValueLamports).toBe("1880934");
    expect(fox?.lamportsPerToken).toBeNull();
    const points = bondingCurvePoints(BigInt("10730259006683"), BigInt("352951"), BigInt("1000000"));
    expect(points[0]?.price).toBeGreaterThan(0);
    expect(points[points.length - 1]?.price).toBeGreaterThan(points[0]?.price);
    expect(classifyVaultMove(BigInt(0), BigInt(492500))).toEqual({ side: "buy", lamports: "492500" });
    expect(classifyVaultMove(BigInt(186), BigInt(0))).toEqual({ side: "sell", lamports: "186" });
    expect(sumVaultVolume(["492500", null, "186"], true)).toBe("492686");
    expect(sumVaultVolume(["492500"], false)).toBeNull();
    const reserves = cpmmReserveValue(BigInt("999999"), BigInt("2069000000000"), BigInt("10000000000000"), 6);
    expect(reserves?.liquidityLamports).toBe("999999");
    expect(reserves?.priceSol).toBe("0.000000000483");
    expect(reserves?.marketValueLamports).toBe("4833247");
    const migration = classifyPoolActivity({
      logs: ["Instruction: MigrateToCpswap", "Instruction: LockCpLiquidity"],
      curveSolBefore: BigInt("999999"), curveSolAfter: BigInt(0),
      curveTokenBefore: BigInt("2069000000000"), curveTokenAfter: BigInt(0),
      cpmmSolBefore: BigInt(0), cpmmSolAfter: BigInt("999999"),
      cpmmTokenBefore: BigInt(0), cpmmTokenAfter: BigInt("2069000000000"),
    });
    expect(migration).toMatchObject({ side: "migration", venue: "migration", lamports: "999999" });
    expect(classifyPoolActivity({
      logs: ["Instruction: SwapBaseInput"],
      curveSolBefore: null, curveSolAfter: null, curveTokenBefore: null, curveTokenAfter: null,
      cpmmSolBefore: BigInt("999999"), cpmmSolAfter: BigInt("1009999"),
      cpmmTokenBefore: BigInt("2069000000000"), cpmmTokenAfter: BigInt("2048000000000"),
    }).side).toBe("buy");
    expect(tradingVolume([{ side: "buy", lamports: "10000" }, { side: "migration", lamports: "999999" }, { side: "sell", lamports: "186" }], true)).toBe("10186");
    expect(tradingVolume([{ side: "buy", lamports: null }], true)).toBeNull();
    expect(cpmmExecutionPoints([{ side: "buy", venue: "curve", solLamports: "10000", tokenRaw: "1000", blockTime: "2026-10-15T00:00:00.000Z" }, { side: "sell", venue: "curve", solLamports: "9000", tokenRaw: "900", blockTime: "2026-10-15T00:01:00.000Z" }])).toEqual([]);
    expect(cpmmExecutionPoints([
      { side: "buy", venue: "cpmm", solLamports: "10000", tokenRaw: "1000000", blockTime: "2026-10-15T00:00:00.000Z" },
      { side: "sell", venue: "cpmm", solLamports: "9000", tokenRaw: "900000", blockTime: "2026-10-15T00:01:00.000Z" },
    ])).toHaveLength(2);
  });
});
