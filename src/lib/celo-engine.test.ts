import { describe, expect, it } from "vitest";
import { evaluateRoll } from "./celo-engine";

const d3 = (a: number, b: number, c: number) =>
  evaluateRoll([a, b, c] as [1 | 2 | 3 | 4 | 5 | 6, 1 | 2 | 3 | 4 | 5 | 6, 1 | 2 | 3 | 4 | 5 | 6]);

describe("evaluateRoll (authentic C-Lo rules)", () => {
  it("1-1-1 is instant_win trips", () => {
    const r = d3(1, 1, 1);
    expect(r.result).toBe("instant_win");
    expect(r.rollName).toBe("Trips");
  });

  it("2-2-2 and 6-6-6 are instant_win Trips", () => {
    expect(d3(2, 2, 2).rollName).toBe("Trips");
    expect(d3(6, 6, 6).rollName).toBe("Trips");
  });

  it("4-5-6 is C-Lo instant win", () => {
    const r = d3(4, 5, 6);
    expect(r.result).toBe("instant_win");
    expect(r.isCelo).toBe(true);
    expect(r.rollName).toBe("C-Lo");
  });

  it("1-2-3 is Trey (instant loss)", () => {
    const r = d3(1, 2, 3);
    expect(r.result).toBe("instant_loss");
    expect(r.rollName).toBe("Trey");
  });

  it("1-1-5 is point 5 (Pound)", () => {
    const r = d3(1, 1, 5);
    expect(r.result).toBe("point");
    expect(r.point).toBe(5);
  });

  it("1-1-2 is point 2 (Shorty)", () => {
    const r = d3(1, 1, 2);
    expect(r.result).toBe("point");
    expect(r.point).toBe(2);
  });

  it("1-1-4 is point 4 (Zoe)", () => {
    const r = d3(1, 1, 4);
    expect(r.result).toBe("point");
    expect(r.point).toBe(4);
  });

  it("5-5-6 is Head Crack (instant win)", () => {
    const r = d3(5, 5, 6);
    expect(r.result).toBe("instant_win");
    expect(r.rollName).toBe("Head Crack");
  });

  it("1-2-4 is no count", () => {
    const r = d3(1, 2, 4);
    expect(r.result).toBe("no_count");
    expect(r.rollName).toBe("No Count");
  });
});
