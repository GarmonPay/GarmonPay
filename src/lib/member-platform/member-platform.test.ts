import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { FINANCIAL_OPERATIONS_PAUSED, isOperationPaused } from "@/lib/security/financial-pause";
import { SOLANA_POLICY } from "@/lib/solana/policy";
import { assertCampaignDraft, quoteCampaignSol } from "./advertising";
import { completeWatch, createMember, heartbeatWatch, recordCommissionRefund, recordPaperFill, recordQualifyingPurchase, saveCampaign, setFollow, startWatch, updateMember } from "./books";
import { artworkPrompt } from "./coin-creator";
import { buildPublicProfile, buildSnapshot } from "./dashboard";
import { ADVERTISER_FIRST_PURCHASE_BPS, ADVERTISER_SUBSEQUENT_PURCHASE_BPS, PAPER_STARTING_LAMPORTS, PAYMENT_ENABLED, PAYOUTS_ENABLED, VIEWER_MATCH_BPS, advertiserCommission, assertNotFinancialSettlement, parseSolToLamports } from "./economics";
import { LEGACY_REFERRAL_COOKIE, LEGACY_REFERRAL_REDIRECT, joinPath } from "./invites";
import { rankPaperTraders, rankVerifiedLive } from "./leaderboard";
import { applyPaperFill } from "./paper";
import { lookupUsdPrice } from "./prices";
import { accrueQualifyingPurchase, quoteReferral, reviewCommissionReversal } from "./referrals";
import { emptyLedger } from "./types";

describe("member economics and referrals", () => {
  it("keeps the agreed rates and refuses settlement", () => {
    expect(ADVERTISER_FIRST_PURCHASE_BPS).toBe(2000);
    expect(ADVERTISER_SUBSEQUENT_PURCHASE_BPS).toBe(1000);
    expect(VIEWER_MATCH_BPS).toBe(10000);
    expect(PAYMENT_ENABLED).toBe(false);
    expect(PAYOUTS_ENABLED).toBe(false);
    expect(FINANCIAL_OPERATIONS_PAUSED).toBe(true);
    expect(SOLANA_POLICY.walletAuthentication).toBe(true);
    expect(SOLANA_POLICY.referralPayouts).toBe(false);
    expect(SOLANA_POLICY.advertisingFunding).toBe(false);
    expect(SOLANA_POLICY.trading).toBe(false);
    expect(() => assertNotFinancialSettlement({ pays: true, charges: false, broadcasts: false })).toThrow(/paused/);
  });

  it("calculates 20% on the first purchase, 10% after that, and a separate 100% viewer match", () => {
    const first = quoteReferral({ purchaseLamports: BigInt("1000000000"), verifiedEarningLamports: BigInt("200000000"), priorQualifyingPurchases: 0 });
    const later = quoteReferral({ purchaseLamports: BigInt("1000000000"), verifiedEarningLamports: BigInt("0"), priorQualifyingPurchases: 1 });
    expect(first.sequence).toBe("first");
    expect(first.advertiserBps).toBe(2000);
    expect(first.commissionLamports).toBe("200000000");
    expect(first.viewerLamports).toBe("200000000");
    expect(first.viewerMatchLamports).toBe("200000000");
    expect(later.sequence).toBe("subsequent");
    expect(later.commissionLamports).toBe("100000000");
    expect(first.payoutsEnabled).toBe(false);
    expect(advertiserCommission(BigInt("2000000000"), 1).toString()).toBe("200000000");
  });

  it("rejects self-referrals, duplicates, unverified purchases, and pays nothing", () => {
    expect(() => accrueQualifyingPurchase({
      referrerId: "a", advertiserId: "a", advertiserVerified: true, purchaseId: "purchase_1", grossLamports: BigInt("1"), priorQualifyingPurchases: 0, existingPurchaseIds: [],
    })).toThrow(/Self-referral/);
    expect(() => accrueQualifyingPurchase({
      referrerId: "a", advertiserId: "b", advertiserVerified: false, purchaseId: "purchase_1", grossLamports: BigInt("1000000000"), priorQualifyingPurchases: 0, existingPurchaseIds: [],
    })).toThrow(/verified/);
    const first = accrueQualifyingPurchase({
      referrerId: "a", advertiserId: "b", advertiserVerified: true, purchaseId: "purchase_1", grossLamports: BigInt("1000000000"), priorQualifyingPurchases: 0, existingPurchaseIds: [],
    });
    expect(first.rateBps).toBe(2000);
    expect(first.payoutsEnabled).toBe(false);
    const second = accrueQualifyingPurchase({
      referrerId: "a", advertiserId: "b", advertiserVerified: true, purchaseId: "purchase_2", grossLamports: BigInt("1000000000"), priorQualifyingPurchases: 1, existingPurchaseIds: ["purchase_1"],
    });
    expect(second.rateBps).toBe(1000);
    expect(() => accrueQualifyingPurchase({
      referrerId: "a", advertiserId: "b", advertiserVerified: true, purchaseId: "purchase_1", grossLamports: BigInt("1000000000"), priorQualifyingPurchases: 1, existingPurchaseIds: ["purchase_1"],
    })).toThrow(/already attributed/);
  });

  it("reverses commissions cumulatively without a wallet debit", () => {
    const half = reviewCommissionReversal({ grossLamports: BigInt("100"), commissionLamports: BigInt("10"), previousRefundedLamports: BigInt("0"), totalRefundedLamports: BigInt("50") });
    const rest = reviewCommissionReversal({ grossLamports: BigInt("100"), commissionLamports: BigInt("10"), previousRefundedLamports: BigInt("50"), totalRefundedLamports: BigInt("100") });
    expect(half.deltaLamports).toBe("5");
    expect(rest.deltaLamports).toBe("5");
    expect(rest.retainedCommissionLamports).toBe("0");
    expect(rest.payoutsEnabled).toBe(false);
    let state = emptyLedger();
    state.commissions.push({
      id: "c1", referrerId: "a", advertiserId: "b", purchaseId: "purchase_1", grossLamports: "100", commissionLamports: "20",
      rateBps: 2000, sequence: "first", priorQualifyingPurchases: 0, refundedLamports: "0", status: "eligible", payoutsEnabled: false, at: "2026-10-14T00:00:00.000Z",
    });
    const refunded = recordCommissionRefund(state, { purchaseId: "purchase_1", totalRefundedLamports: BigInt("100") });
    expect(refunded.review.fullyReversed).toBe(true);
    expect(refunded.state.commissions[0].status).toBe("reversed");
    const prior = refunded.state.commissions.filter((item) => item.status === "eligible").length;
    const next = accrueQualifyingPurchase({
      referrerId: "a", advertiserId: "b", advertiserVerified: true, purchaseId: "purchase_2", grossLamports: BigInt("100"), priorQualifyingPurchases: prior, existingPurchaseIds: ["purchase_1"],
    });
    expect(next.sequence).toBe("first");
    expect(next.rateBps).toBe(2000);
  });

  it("attributes one direct referrer and does not let staging profiles accrue a payable commission", () => {
    let state = emptyLedger();
    const first = createMember(state, { displayName: "Ada", handle: "ada" });
    const second = createMember(first.state, { displayName: "Bea", handle: "bea", inviteCode: first.member.inviteCode });
    const third = createMember(second.state, { displayName: "Cyo", handle: "cyo", inviteCode: second.member.inviteCode });
    state = third.state;
    expect(state.members.find((member) => member.handle === "bea")?.referredBy).toBe(first.member.id);
    expect(state.members.find((member) => member.handle === "cyo")?.referredBy).toBe(second.member.id);
    expect(() => recordQualifyingPurchase(state, { advertiserId: second.member.id, purchaseId: "purchase_9", grossLamports: BigInt("1000000000") })).toThrow(/verified/);
    expect(() => createMember(state, { displayName: "Dee", handle: "dee", inviteCode: "a".repeat(32) })).toThrow(/Legacy/);
    const legacy = readFileSync("src/app/r/[code]/page.tsx", "utf8");
    expect(legacy).toContain(LEGACY_REFERRAL_REDIRECT);
    expect(legacy).toContain(LEGACY_REFERRAL_COOKIE);
    expect(joinPath(first.member.inviteCode)).toBe(`/member/join/${first.member.inviteCode}`);
  });
});

describe("advertising and verified views", () => {
  it("enforces the 500-view packages without enabling payment", () => {
    expect(() => assertCampaignDraft({ title: "Launch", url: "https://example.com", tier: "seconds5", views: 1000 })).toThrow(/500/);
    const draft = assertCampaignDraft({ title: "Desk", url: "https://example.com/ad", tier: "seconds60", views: 500 });
    expect(draft.purchaseMicrousd).toBe("24990000");
    expect(draft.seconds).toBe(60);
    const quote = quoteCampaignSol({ tier: "seconds5", views: 500, solPriceMicrousd: "150000000", rateObservedAt: 1_000, now: 1_000 });
    expect(quote.paymentEnabled).toBe(false);
    expect(quote.viewerRewardConfigured).toBe(false);
    expect(quote.viewerMatchBps).toBe(10000);
    expect(quote.grossLamports).toBe("46600000");
    expect(quote.views).toBe(500);
  });

  it("rejects duplicate, rushed, automated, and self-owned view claims", () => {
    let state = createMember(emptyLedger(), { displayName: "Ada", handle: "ada" }).state;
    const owner = state.members[0];
    state = createMember(state, { displayName: "Bea", handle: "bea" }).state;
    const viewer = state.members.find((member) => member.handle === "bea");
    if (!viewer) throw new Error("missing viewer");
    const saved = saveCampaign(state, owner.id, { title: "Desk", url: "https://example.com/ad", tier: "seconds5", views: 500 });
    state = saved.state;
    expect(saved.campaign.paymentEnabled).toBe(false);
    expect(() => startWatch(state, owner.id, saved.campaign.id)).toThrow(/own campaign/);
    let opened = startWatch(state, viewer.id, saved.campaign.id, 1_000);
    state = heartbeatWatch(opened.state, viewer.id, opened.session.id);
    let finished = completeWatch(state, viewer.id, opened.session.id, { nowMs: 2_000, webdriver: false });
    expect(finished.session.status).toBe("rejected");
    opened = startWatch(finished.state, viewer.id, saved.campaign.id, 10_000);
    state = heartbeatWatch(opened.state, viewer.id, opened.session.id);
    finished = completeWatch(state, viewer.id, opened.session.id, { nowMs: 10_000 + 5_000, webdriver: true });
    expect(finished.session.status).toBe("rejected");
    opened = startWatch(finished.state, viewer.id, saved.campaign.id, 20_000);
    state = heartbeatWatch(opened.state, viewer.id, opened.session.id);
    finished = completeWatch(state, viewer.id, opened.session.id, { nowMs: 25_000, webdriver: false });
    expect(finished.session.status).toBe("verified");
    expect(finished.session.funded).toBe(false);
    expect(finished.session.payoutsEnabled).toBe(false);
    expect(() => startWatch(finished.state, viewer.id, saved.campaign.id, 30_000)).toThrow(/already has a verified view/);
  });
});

describe("paper trading, rankings, and privacy", () => {
  it("starts at 10 virtual SOL and uses the supplied live price", () => {
    const created = createMember(emptyLedger(), { displayName: "Ada", handle: "ada" });
    expect(created.member.paperCashLamports).toBe(PAPER_STARTING_LAMPORTS.toString());
    const bought = applyPaperFill({
      cashLamports: PAPER_STARTING_LAMPORTS,
      position: null,
      side: "buy",
      spendLamports: BigInt("1000000000"),
      tokenMicrousd: BigInt("50000000000"),
      solMicrousd: BigInt("100000000"),
    });
    expect(bought.microUnits).toBe(BigInt("2000"));
    const sold = applyPaperFill({
      cashLamports: bought.cashLamports,
      position: bought.position,
      side: "sell",
      sellMicroUnits: BigInt("2000"),
      tokenMicrousd: BigInt("100000000000"),
      solMicrousd: BigInt("100000000"),
    });
    expect(sold.realizedLamports).toBe(BigInt("1000000000"));
    expect(() => applyPaperFill({
      cashLamports: BigInt("1"), position: null, side: "buy", spendLamports: BigInt("2"), tokenMicrousd: BigInt("1"), solMicrousd: BigInt("1"),
    })).toThrow(/not available/);
  });

  it("keeps paper rankings separate from verified live and does not invent live rows", () => {
    let state = createMember(emptyLedger(), { displayName: "Ada", handle: "ada" }).state;
    const member = state.members[0];
    const recorded = recordPaperFill(state, member.id, {
      symbol: "BTC", side: "buy", spendSol: "1", tokenMicrousd: BigInt("50000000000"), solMicrousd: BigInt("100000000"), priceSource: "test", at: "2026-10-14T12:00:00.000Z",
    });
    state = recorded.state;
    const sold = recordPaperFill(state, member.id, {
      symbol: "BTC", side: "sell", sellUnits: "0.002", tokenMicrousd: BigInt("100000000000"), solMicrousd: BigInt("100000000"), priceSource: "test", at: "2026-10-14T13:00:00.000Z",
    });
    const rows = rankPaperTraders({
      nowMs: Date.parse("2026-10-14T18:00:00.000Z"),
      period: "daily",
      members: sold.state.members,
      fills: sold.state.paperFills,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].realizedLamports).toBe("1000000000");
    const live = rankVerifiedLive();
    expect(live.rows).toEqual([]);
    expect(live.available).toBe(false);
    const snapshot = buildSnapshot(sold.state, member.id, Date.parse("2026-10-14T18:00:00.000Z"));
    expect(snapshot.earnings.fundedLamports).toBeNull();
    expect(snapshot.payoutsEnabled).toBe(false);
    expect(snapshot.walletConnected).toBe(false);
    expect(snapshot.identity.productionSource).toBe("wallet-signature");
    expect(snapshot.identity.stagingProfileIsWallet).toBe(false);
    expect(snapshot.profile && "id" in snapshot.profile).toBe(false);
  });

  it("hides private activity and never follows yourself", () => {
    let state = createMember(emptyLedger(), { displayName: "Ada", handle: "ada" }).state;
    const ada = state.members[0];
    state = createMember(state, { displayName: "Bea", handle: "bea" }).state;
    state = setFollow(state, ada.id, "bea", true);
    state = setFollow(state, ada.id, "bea", true);
    expect(state.follows).toHaveLength(1);
    expect(() => setFollow(state, ada.id, "ada", true)).toThrow(/yourself/);
    state = updateMember(state, ada.id, { profilePublic: false, biography: "secret note" });
    const profile = buildPublicProfile(state, "ada", null);
    expect(profile?.biography).toBe("");
    expect(profile?.activity).toEqual([]);
    expect(profile).not.toHaveProperty("id");
    expect(JSON.stringify(profile)).not.toMatch(/secret|seed|private key/i);
  });

  it("writes a copyable artwork prompt without calling an image API", () => {
    const prompt = artworkPrompt({ name: "Purple Lion", ticker: "lion", description: "A gold lion", keywords: "purple gold" });
    expect(prompt).toContain("Purple Lion");
    expect(prompt).toContain("LION");
    expect(prompt.toLowerCase()).not.toContain("openai");
    expect(prompt).not.toContain("api key");
  });

  it("refuses a missing price instead of inventing one", async () => {
    const missing = await lookupUsdPrice("DOGE", async () => new Response("{}", { status: 404 }));
    expect(missing).toBeNull();
    const price = await lookupUsdPrice("SOL", async () => Response.json({ solana: { usd: 150.25 } }));
    expect(price?.microusd).toBe("150250000");
    expect(price?.source).toBe("coingecko");
  });

  it("leaves member writes paused at the API boundary", () => {
    expect(isOperationPaused("/api/member-platform/snapshot", "POST")).toBe(true);
    expect(isOperationPaused("/api/member-platform/snapshot", "GET")).toBe(false);
    expect(isOperationPaused("/api/member-platform/paper", "POST")).toBe(true);
    expect(parseSolToLamports("1.5")?.toString()).toBe("1500000000");
  });
});
