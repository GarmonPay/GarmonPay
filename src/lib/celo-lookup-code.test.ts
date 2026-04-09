import { describe, it, expect } from "vitest";
import { normalizeCeloRoomLookupCode } from "@/lib/celo-lookup-code";

describe("normalizeCeloRoomLookupCode", () => {
  it("strips dashes and lowercases", () => {
    expect(normalizeCeloRoomLookupCode("ab-cd-12")).toBe("ABCD12");
  });

  it("trims whitespace", () => {
    expect(normalizeCeloRoomLookupCode("  xyz9  ")).toBe("XYZ9");
  });
});
