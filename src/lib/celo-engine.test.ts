import { describe, expect, it } from "vitest";
import { evaluateRoll } from "./celo-engine";

const d3 = (a: number, b: number, c: number) =>
  evaluateRoll([a, b, c] as [1 | 2 | 3 | 4 | 5 | 6, 1 | 2 | 3 | 4 | 5 | 6, 1 | 2 | 3 | 4 | 5 | 6]);

describe("evaluateRoll (C-Lo classification)", () => {
  it("[6,6,1] => DICK auto_loss (pair + 1)", () => {
    const r = d3(6, 6, 1);
    expect(r.result).toBe("instant_loss");
    expect(r.rollName).toBe("DICK • AUTOMATIC LOSS");
  });

  it("[5,5,1] => DICK auto_loss", () => {
    const r = d3(5, 5, 1);
    expect(r.result).toBe("instant_loss");
    expect(r.rollName).toBe("DICK • AUTOMATIC LOSS");
  });

  it("[2,2,1] => DICK auto_loss", () => {
    const r = d3(2, 2, 1);
    expect(r.result).toBe("instant_loss");
    expect(r.rollName).toBe("DICK • AUTOMATIC LOSS");
  });

  it("[1,1,1] => ACE OUT auto_win", () => {
    const r = d3(1, 1, 1);
    expect(r.result).toBe("instant_win");
    expect(r.rollName).toBe("ACE OUT • AUTOMATIC WIN");
    expect(r.isTrips).toBe(true);
  });

  it("[1,2,3] any order => ACE-DEUCE-TREY auto_loss", () => {
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
      expect(r.rollName).toBe("ACE-DEUCE-TREY • AUTOMATIC LOSS");
    }
  });

  it("[4,5,6] any order => C-LO auto_win", () => {
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
      expect(r.rollName).toBe("C-LO • AUTOMATIC WIN");
      expect(r.isCelo).toBe(true);
    }
  });

  it("[6,6,4] => ZOE • POINT 4", () => {
    const r = d3(6, 6, 4);
    expect(r.result).toBe("point");
    expect(r.point).toBe(4);
    expect(r.rollName).toBe("ZOE • POINT 4");
  });

  it("[5,5,6] => HAND CRACK auto_win", () => {
    const r = d3(5, 5, 6);
    expect(r.result).toBe("instant_win");
    expect(r.rollName).toBe("HAND CRACK • AUTOMATIC WIN");
    expect(r.point).toBeNull();
  });

  it("[1,1,6] => HAND CRACK auto_win", () => {
    const r = d3(1, 1, 6);
    expect(r.result).toBe("instant_win");
    expect(r.rollName).toBe("HAND CRACK • AUTOMATIC WIN");
  });

  it("[2,6,2] => HAND CRACK auto_win (pair of 2s + 6)", () => {
    const r = d3(2, 6, 2);
    expect(r.result).toBe("instant_win");
    expect(r.rollName).toBe("HAND CRACK • AUTOMATIC WIN");
  });

  it("[3,3,2] => SHORTY • POINT 2", () => {
    const r = d3(3, 3, 2);
    expect(r.result).toBe("point");
    expect(r.point).toBe(2);
    expect(r.rollName).toBe("SHORTY • POINT 2");
  });

  it("non-pair junk => NO POINT reroll", () => {
    const r = d3(1, 2, 4);
    expect(r.result).toBe("no_count");
    expect(r.rollName).toBe("NO POINT • REROLL");
  });

  it("other triples => TRIPS n • AUTOMATIC WIN", () => {
    expect(d3(2, 2, 2).rollName).toBe("TRIPS 2 • AUTOMATIC WIN");
    expect(d3(6, 6, 6).rollName).toBe("TRIPS 6 • AUTOMATIC WIN");
  });
});
