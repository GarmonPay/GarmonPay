import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { KINGDOM_BOTTOM, KINGDOM_MENU, KINGDOM_SIDE, kingdomCurrent } from "./kingdom-navigation";

const navbar = readFileSync(new URL("../components/Navbar.tsx", import.meta.url), "utf8");

describe("kingdom navigation", () => {
  it("shares one sidebar and one mobile bar", () => {
    expect(KINGDOM_BOTTOM.map((item) => item.label)).toEqual(["Home", "Discover", "Launchpad", "Trade", "Earn"]);
    expect(KINGDOM_SIDE.map((item) => item.label)).toContain("Paper Trading");
    expect(KINGDOM_SIDE.map((item) => item.label)).toContain("Referrals");
    expect(new Set(KINGDOM_SIDE.map((item) => item.href)).size).toBe(KINGDOM_SIDE.length);
    expect(navbar.match(/<header/g)).toHaveLength(1);
    expect(navbar).toContain('aria-label="Kingdom"');
    expect(navbar).toContain('aria-label="Kingdom mobile"');
    expect(navbar).not.toContain("gp-lock-side");
  });

  it("keeps every required mobile destination without duplicate menu links", () => {
    expect(new Set(KINGDOM_MENU.map(item => item.href)).size).toBe(KINGDOM_MENU.length);
    for (const href of ["/games", "/member/community", "/member/referrals", "/member/paper", "/member", "/solana/members"]) {
      expect(KINGDOM_MENU.some(item => item.href === href)).toBe(true);
    }
    expect(KINGDOM_MENU.some(item => item.href === "/login")).toBe(false);
  });

  it("highlights only the matching destination", () => {
    expect(kingdomCurrent("/member", "/member")).toBe(true);
    expect(kingdomCurrent("/member/paper", "/member")).toBe(false);
    expect(kingdomCurrent("/member/paper", "/member/paper")).toBe(true);
    expect(kingdomCurrent("/solana/trade", "/")).toBe(false);
  });
});