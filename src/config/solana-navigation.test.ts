import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SOLANA_NAVIGATION } from "./solana-navigation";

const navbar = readFileSync(new URL("../components/Navbar.tsx", import.meta.url), "utf8");
const section = readFileSync(new URL("../app/solana/[section]/page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/solana.css", import.meta.url), "utf8");

describe("public navigation", () => {
  it("keeps every primary destination in one header", () => {
    expect(SOLANA_NAVIGATION.map((item) => item.href)).toEqual([
      "/",
      "/solana/members",
      "/solana/launchpad",
      "/solana/trade",
      "/solana/earn",
      "/solana/advertise",
      "/games",
      "/solana/referrals",
      "/solana/leaderboard",
      "/solana/fees",
      "/solana/spotlight",
      "/solana/dashboard",
    ]);
    expect(new Set(SOLANA_NAVIGATION.map((item) => item.href)).size).toBe(SOLANA_NAVIGATION.length);
  });

  it("does not render a second feature navigation row", () => {
    expect(section).not.toContain("gp-sol-subnav");
    expect(section).not.toContain('aria-label="Solana features"');
    expect(css).not.toContain(".gp-sol-subnav{");
    expect(navbar.match(/<header/g)).toHaveLength(1);
    expect(navbar).toContain('aria-label="Main"');
    expect(navbar).toContain('aria-label={open ? "Close menu" : "Open menu"}');
  });
});
