import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { isOperationPaused } from "./financial-pause";
import { walletAuthEnabled } from "@/lib/solana/policy";
import { devnetPlatformSubmitAllowed } from "@/lib/solana/devnet-guard";

describe("Security audit financial pause", () => {
  it.each([
    ["/api/wallet/fund", "POST"], ["/api/wallet/deposit", "POST"],
    ["/api/coins/checkout", "POST"], ["/api/coins/redeem", "POST"],
    ["/api/create-checkout-session", "POST"], ["/api/stripe/webhook", "POST"],
    ["/api/webhooks/stripe/pay", "POST"], ["/api/stripe-connect/transfer", "POST"],
    ["/api/cron/membership-renewal", "GET"], ["/api/cron/arena-jackpot", "GET"],
    ["/api/arena/fights/fight-id", "PATCH"], ["/api/admin/users/credit-usd", "POST"],
    ["/api/admin/balance-monitor/fix", "POST"], ["/api/admin/gpay/claims/id/complete", "POST"],
    ["/api/solana/future-payout", "POST"], ["/api/new-money-route", "DELETE"],
  ])("blocks %s %s before any handler", (path, method) => {
    const response = middleware(new NextRequest("https://garmonpay.com" + path, { method,
      headers: { Authorization: "Bearer forged", "X-Admin-Id": "owner" } }));
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it.each(["/api/wallet/fund/", "/api/wallet/%66und", "/api/stripe%2fwebhook", "/api/stripe//webhook", "/api/stripe/%invalid"])("fails closed for alternate path %s", path => {
    expect(isOperationPaused(path, "POST")).toBe(true);
  });
  it.each(["/api/games/budget", "/api/admin/gamification", "/api/admin/gamification-config"])("blocks financial side effects in legacy read handler %s", path => {
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      const response = middleware(new NextRequest("https://garmonpay.com" + path, { method }));
      expect(response.status).toBe(503);
      expect(isOperationPaused(path + "/", method)).toBe(true);
      expect(isOperationPaused(path.replace("gamification", "%67amification"), method)).toBe(true);
    }
  });
  it.each([["/api/coins/packages", "GET"], ["/api/arena/cpu-fighters", "GET"],
    ["/api/wallet/history", "GET"], ["/api/profile", "PATCH"],
    ["/api/solana/launches/validate", "POST"], ["/api/solana/launches/suggest", "POST"], ["/api/solana/launches/artwork", "POST"], ["/api/solana/launches/artwork", "DELETE"], ["/api/solana/launches/draft", "POST"], ["/api/solana/launches/vanity", "POST"], ["/api/solana/launches/platform", "POST"], ["/api/solana/launches/platform/submit", "POST"], ["/api/solana/launches/devnet", "POST"], ["/api/solana/devnet/trade", "POST"], ["/api/solana/auth/challenge", "POST"], ["/api/solana/auth/verify", "POST"], ["/api/auth/admin/login", "POST"]])("preserves reviewed route %s %s", (path, method) => {
    expect(isOperationPaused(path, method)).toBe(false);
  });
  it("does not let an environment toggle turn wallet sign-in or financial routes on or off", () => {
    vi.stubEnv("SOLANA_WALLET_AUTH_ENABLED", "false");
    expect(walletAuthEnabled()).toBe(true);
    expect(isOperationPaused("/api/solana/auth/verify", "POST")).toBe(false);
    expect(isOperationPaused("/api/wallet/fund", "POST")).toBe(true);
    expect(isOperationPaused("/api/wallet/deposit", "POST")).toBe(true);
    vi.unstubAllEnvs();
  });
  it("keeps the broad devnet launch executor closed when a production flag is set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("GARMONPAY_DEVNET_LAUNCH", "1");
    vi.stubEnv("SOLANA_CLUSTER", "devnet");
    expect(devnetPlatformSubmitAllowed()).toBe(false);
    expect(isOperationPaused("/api/solana/launches/platform/submit", "POST")).toBe(false);
    vi.unstubAllEnvs();
  });
});
