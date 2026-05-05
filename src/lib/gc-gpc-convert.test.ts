import { describe, expect, it } from "vitest";
import {
  GC_TO_GPC_RATE,
  gpcPlatformFeeFromGc,
  gpcReceivedFromGc,
} from "@/lib/gc-gpc-convert";

describe("GC → GPC conversion", () => {
  it("matches backend integer math: 10 GC → 970 GPC", () => {
    expect(gpcReceivedFromGc(10)).toBe(10 * GC_TO_GPC_RATE);
    expect(gpcReceivedFromGc(10)).toBe(970);
    expect(gpcPlatformFeeFromGc(10)).toBe(30);
  });

  it("matches backend integer math: 100 GC → 9,700 GPC", () => {
    expect(gpcReceivedFromGc(100)).toBe(9700);
    expect(gpcPlatformFeeFromGc(100)).toBe(300);
  });

  it("2500 GC → 242,500 GPC", () => {
    expect(gpcReceivedFromGc(2500)).toBe(242_500);
    expect(gpcPlatformFeeFromGc(2500)).toBe(7500);
  });
});
