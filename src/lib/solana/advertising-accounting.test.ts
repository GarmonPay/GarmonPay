import { describe, expect, it } from "vitest";
import { reviewCampaignAllocation, reviewCommissionReversal, type CampaignAllocationInput } from "./advertising-accounting";
const input: CampaignAllocationInput = { purchaseId: "purchase_1", advertiserId: "advertiser_1", campaignId: "campaign_1", pricingVersion: "synthetic_v1", currency: "SOL", grossLamports: "3000000", eligibleViews: 1000, viewerLamportsPerView: "300", operatingReserveLamports: "100000", referral: { referrerId: "referrer_1", attributionId: "attribution_1", purchaseKind: "first", commissionBps: 1000 } };
describe("Staging campaign allocation", () => {
  it("conserves confirmed funding without floating point or payout activation", () => {
    const result = reviewCampaignAllocation(input);
    expect(result).toMatchObject({ viewerReserveLamports: "300000", viewerReferralReserveLamports: "150000", commissionLamports: "300000", operatingReserveLamports: "100000", residualLamports: "2150000", paymentEnabled: false, payoutsEnabled: false });
    expect(BigInt(result.viewerReserveLamports) + BigInt(result.viewerReferralReserveLamports) + BigInt(result.commissionLamports) + BigInt(result.operatingReserveLamports) + BigInt(result.residualLamports)).toBe(BigInt(result.grossLamports));
  });
  it("uses 10% on the first purchase, 5% after that, and zero without attribution", () => {
    expect(reviewCampaignAllocation({ ...input, referral: { ...input.referral!, purchaseKind: "subsequent", commissionBps: 500 } }).commissionLamports).toBe("150000");
    expect(reviewCampaignAllocation({ ...input, referral: null }).commissionLamports).toBe("0");
    expect(() => reviewCampaignAllocation({ ...input, referral: { ...input.referral!, purchaseKind: "subsequent", commissionBps: 1000 } })).toThrow(/terms/);
  });
  it.each([0, 999, 1001, 1000001, 1000.1, NaN, Infinity])("rejects invalid view allocation %s", eligibleViews => {
    expect(() => reviewCampaignAllocation({ ...input, eligibleViews })).toThrow();
  });
  it("refuses unfunded reserves and self-referrals", () => {
    expect(() => reviewCampaignAllocation({ ...input, grossLamports: "1000" })).toThrow(/cover/);
    expect(() => reviewCampaignAllocation({ ...input, referral: { ...input.referral!, referrerId: input.advertiserId } })).toThrow(/Self-referral/);
    expect(() => reviewCampaignAllocation({ ...input, referral: { ...input.referral!, commissionBps: 2000 } })).toThrow(/terms/);
  });
  it.each(["1.1", "-1", "01", "9223372036854775808"])("rejects malformed or overflowing money %s", grossLamports => {
    expect(() => reviewCampaignAllocation({ ...input, grossLamports })).toThrow();
  });
  it("requires stable identity and approved-version references", () => {
    expect(() => reviewCampaignAllocation({ ...input, purchaseId: "" })).toThrow();
    expect(() => reviewCampaignAllocation({ ...input, pricingVersion: "" })).toThrow();
  });
});
describe("Cumulative referral reversals", () => {
  const refund = { purchaseId: "purchase_1", originalGrossLamports: "101", originalCommissionLamports: "10", previousRefundedLamports: "0", totalRefundedLamports: "50" };
  it("retains exact rounding across partial refunds and reverses all on full refund", () => {
    const first = reviewCommissionReversal(refund);
    const second = reviewCommissionReversal({ ...refund, previousRefundedLamports: "50", totalRefundedLamports: "101" });
    expect(first.deltaLamports).toBe("4"); expect(second.deltaLamports).toBe("6");
    expect(second.retainedCommissionLamports).toBe("0"); expect(second.requiresAtomicPosting).toBe(true);
  });
  it("produces no new reversal for the same cumulative refund", () => {
    expect(reviewCommissionReversal({ ...refund, previousRefundedLamports: "50" }).deltaLamports).toBe("0");
  });
  it.each([{ totalRefundedLamports: "102" }, { previousRefundedLamports: "51" }, { originalGrossLamports: "0" }, { originalCommissionLamports: "102" }])("rejects inconsistent refund history %j", change => {
    expect(() => reviewCommissionReversal({ ...refund, ...change })).toThrow();
  });
});
