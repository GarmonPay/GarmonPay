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

  it("4-5-6 is C-Lo in any order", () => {
    const permutations: [number, number, number][] = [
      [4, 5, 6],
      [4, 6, 5],
      [5, 4, 6],
      [5, 6, 4],
      [6, 4, 5],
      [6, 5, 4],
    ];
    for (const [x, y, z] of permutations) {
      const r = d3(x, y, z);
      expect(r.result).toBe("instant_win");
      expect(r.rollName).toBe("C-Lo");
      expect(r.isCelo).toBe(true);
    }
  });

  it("1-2-3 is DICK automatic loss in any order", () => {
    const permutations: [number, number, number][] = [
      [1, 2, 3],
      [1, 3, 2],
      [2, 1, 3],
      [2, 3, 1],
      [3, 1, 2],
      [3, 2, 1],
    ];
    for (const [x, y, z] of permutations) {
      const r = d3(x, y, z);
      expect(r.result).toBe("instant_loss");
      expect(r.rollName).toBe("DICK • AUTOMATIC LOSS");
    }
  });

  it("1-1-5 is point 5 (Pound)", () => {
    const r = d3(1, 1, 5);
    expect(r.result).toBe("point");
    expect(r.point).toBe(5);
    expect(r.rollName).toBe("Pound");
  });

  it("1-1-2 is point 2 (Shorty)", () => {
    const r = d3(1, 1, 2);
    expect(r.result).toBe("point");
    expect(r.point).toBe(2);
    expect(r.rollName).toBe("Shorty");
  });

  it("1-1-3 is point 3 (Girl)", () => {
    const r = d3(1, 1, 3);
    expect(r.result).toBe("point");
    expect(r.point).toBe(3);
    expect(r.rollName).toBe("Girl");
  });

  it("1-1-4 is point 4 (Zoe)", () => {
    const r = d3(1, 1, 4);
    expect(r.result).toBe("point");
    expect(r.point).toBe(4);
    expect(r.rollName).toBe("Zoe");
  });

  it("2-2-1 is Dick (instant loss)", () => {
    const r = d3(2, 2, 1);
    expect(r.result).toBe("instant_loss");
    expect(r.rollName).toBe("Dick");
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

  /** Spot-check authentic street names for rules documentation / regression. */
  it("cultural rollName map (sample)", () => {
    const samples: [number, number, number, string][] = [
      [3, 3, 3, "Trips"],
      [4, 5, 6, "C-Lo"],
      [1, 2, 3, "DICK • AUTOMATIC LOSS"],
      [6, 6, 5, "Pound"],
      [4, 4, 6, "Head Crack"],
      [6, 6, 2, "Shorty"],
      [5, 5, 4, "Zoe"],
      [4, 4, 3, "Girl"],
    ];
    for (const [a, b, c, name] of samples) {
      expect(d3(a, b, c).rollName).toBe(name);
    }
  });
});
