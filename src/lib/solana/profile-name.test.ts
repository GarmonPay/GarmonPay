import { describe, expect, it } from "vitest";
import { DISPLAY_NAME_MESSAGE, generatedHandle, memberPublicLabel, normalizeDisplayName, normalizeHandle } from "./profile-name";
import { referralToken } from "./referral-token";

describe("display names", () => {
  it("accepts HolyGhost and keeps it separate from a handle", () => {
    expect(normalizeDisplayName("  HolyGhost  ")).toBe("HolyGhost");
    expect(normalizeDisplayName("Holy Ghost")).toBe("Holy Ghost");
    expect(normalizeDisplayName("O'Brien-2")).toBe("O'Brien-2");
    expect(normalizeDisplayName("")).toBe("");
    expect(normalizeHandle("HolyGhost")).toBe("holyghost");
  });

  it("rejects empty-looking, oversized, and reserved names", () => {
    for (const name of ["A", " x", "bad<script>", "https://evil.example", "x".repeat(33)]) expect(() => normalizeDisplayName(name)).toThrow(DISPLAY_NAME_MESSAGE);
    expect(() => normalizeHandle("admin")).toThrow();
    expect(generatedHandle("m_" + "a".repeat(20))).toBe(true);
    expect(generatedHandle("holyghost")).toBe(false);
    expect(memberPublicLabel({ displayName: "HolyGhost", username: "m_" + "a".repeat(20) })).toBe("HolyGhost");
    expect(memberPublicLabel({ displayName: "", username: "holyghost" })).toBe("holyghost");
    expect(memberPublicLabel({ displayName: "  ", username: "m_" + "b".repeat(20) })).toBe("Member");
  });
});

describe("referral tokens", () => {
  it("keeps legacy codes and short invite codes, and drops anything else", () => {
    expect(referralToken("a".repeat(32))).toBe("a".repeat(32));
    expect(referralToken("ab23cdef")).toBe("ab23cdef");
    expect(referralToken("HolyGhost")).toBeNull();
    expect(referralToken("0".repeat(8))).toBeNull();
    expect(referralToken("../admin")).toBeNull();
  });
});
