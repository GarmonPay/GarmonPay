import { lamports } from "./amounts";

export type CampaignAllocationInput = {
  purchaseId: string; advertiserId: string; campaignId: string; pricingVersion: string;
  currency: "SOL"; grossLamports: string; eligibleViews: number;
  viewerLamportsPerView: string; operatingReserveLamports: string;
  referral: null | { referrerId: string; attributionId: string; purchaseKind: "first" | "subsequent"; commissionBps: number };
};

function identifier(value: unknown) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(value)) throw new Error("Stable server-issued identifier required");
  return value;
}

/** Staging arithmetic only. Inputs must originate from an approved server quote and
 * durable purchase/attribution records, never browser-supplied financial terms.
 * A database transaction must claim purchase + finalized receipt, reserve liabilities,
 * and journal together. This pure review does not authorize or post a payment.
 */
export function reviewCampaignAllocation(input: CampaignAllocationInput) {
  for (const field of [input.purchaseId, input.advertiserId, input.campaignId, input.pricingVersion]) identifier(field);
  if (input.currency !== "SOL") throw new Error("SOL allocation required");
  if (!Number.isSafeInteger(input.eligibleViews) || input.eligibleViews < 1000 || input.eligibleViews > 1000000 || input.eligibleViews % 1000) throw new Error("Views must be bounded increments of 1,000");
  const gross = lamports(input.grossLamports), perView = lamports(input.viewerLamportsPerView);
  if (gross === BigInt(0) || perView === BigInt(0)) throw new Error("Positive confirmed funding and viewer allocation required");
  const viewerReserve = perView * BigInt(input.eligibleViews);
  const operatingReserve = lamports(input.operatingReserveLamports);
  // Lifetime viewer match is separately reserved; the viewer's reward stays whole.
  const viewerReferralReserve = ((perView + BigInt(1)) / BigInt(2)) * BigInt(input.eligibleViews);
  let commission = BigInt(0);
  if (input.referral) {
    const referral = input.referral;
    identifier(referral.referrerId); identifier(referral.attributionId);
    if (referral.referrerId === input.advertiserId) throw new Error("Self-referral denied");
    if (referral.purchaseKind !== "first" && referral.purchaseKind !== "subsequent") throw new Error("Verified purchase classification required");
    const approvedBps = referral.purchaseKind === "first" ? 1000 : 500;
    if (referral.commissionBps !== approvedBps) throw new Error("Referral terms differ from approved model");
    commission = gross * BigInt(approvedBps) / BigInt(10000);
  }
  const residual = gross - viewerReserve - viewerReferralReserve - commission - operatingReserve;
  if (residual < BigInt(0)) throw new Error("Funding cannot cover viewer, referral and operating reserves");
  return { purchaseId: input.purchaseId, pricingVersion: input.pricingVersion, grossLamports: gross.toString(),
    viewerReserveLamports: viewerReserve.toString(), commissionLamports: commission.toString(),
    viewerReferralReserveLamports: viewerReferralReserve.toString(),
    operatingReserveLamports: operatingReserve.toString(), residualLamports: residual.toString(),
    paymentEnabled: false as const, payoutsEnabled: false as const };
}

export type CommissionReversalInput = {
  purchaseId: string; originalGrossLamports: string; originalCommissionLamports: string;
  previousRefundedLamports: string; totalRefundedLamports: string;
};

/** Cumulative reversal prevents repeated rounding from leaking liabilities. The
 * caller must lock the purchase, deduplicate the refund receipt, and atomically post
 * the delta. Paid commissions may require a receivable; this never debits a wallet.
 */
export function reviewCommissionReversal(input: CommissionReversalInput) {
  identifier(input.purchaseId);
  const gross = lamports(input.originalGrossLamports), original = lamports(input.originalCommissionLamports);
  const previous = lamports(input.previousRefundedLamports), total = lamports(input.totalRefundedLamports);
  if (gross === BigInt(0) || original > gross || previous > total || total > gross) throw new Error("Invalid cumulative refund");
  const previousReversal = original * previous / gross;
  const totalReversal = original * total / gross;
  return { purchaseId: input.purchaseId, deltaLamports: (totalReversal - previousReversal).toString(),
    reversedCommissionLamports: totalReversal.toString(), retainedCommissionLamports: (original - totalReversal).toString(),
    requiresAtomicPosting: true as const, payoutsEnabled: false as const };
}
