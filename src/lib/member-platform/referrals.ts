import { ECONOMICS_VERSION, PAYOUTS_ENABLED, VIEWER_MATCH_BPS, advertiserCommission, advertiserRateBps, viewerMatch } from "./economics";

export function quoteReferral(input: { purchaseLamports: bigint; verifiedEarningLamports: bigint; priorQualifyingPurchases: number }) {
  const rateBps = advertiserRateBps(input.priorQualifyingPurchases);
  const commission = input.purchaseLamports === BigInt("0") ? BigInt("0") : advertiserCommission(input.purchaseLamports, input.priorQualifyingPurchases);
  const match = viewerMatch(input.verifiedEarningLamports);
  return {
    economicsVersion: ECONOMICS_VERSION,
    advertiserBps: rateBps,
    sequence: input.priorQualifyingPurchases === 0 ? "first" as const : "subsequent" as const,
    commissionLamports: commission.toString(),
    viewerLamports: match.viewerLamports.toString(),
    viewerMatchLamports: match.matchLamports.toString(),
    viewerMatchBps: VIEWER_MATCH_BPS,
    multilevel: false,
    illustrative: true,
    payoutsEnabled: PAYOUTS_ENABLED,
    paymentEnabled: false as const,
  };
}

export function accrueQualifyingPurchase(input: {
  referrerId: string;
  advertiserId: string;
  advertiserVerified: boolean;
  purchaseId: string;
  grossLamports: bigint;
  priorQualifyingPurchases: number;
  existingPurchaseIds: string[];
}) {
  if (!input.advertiserVerified) throw new Error("A qualifying purchase requires a verified member. Staging profiles are not payable.");
  if (input.referrerId === input.advertiserId) throw new Error("Self-referral denied.");
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(input.purchaseId)) throw new Error("A server purchase id is required.");
  if (input.existingPurchaseIds.includes(input.purchaseId)) throw new Error("That purchase was already attributed.");
  const rateBps = advertiserRateBps(input.priorQualifyingPurchases);
  const commission = advertiserCommission(input.grossLamports, input.priorQualifyingPurchases);
  return {
    economicsVersion: ECONOMICS_VERSION,
    referrerId: input.referrerId,
    advertiserId: input.advertiserId,
    purchaseId: input.purchaseId,
    grossLamports: input.grossLamports.toString(),
    commissionLamports: commission.toString(),
    rateBps,
    sequence: input.priorQualifyingPurchases === 0 ? "first" as const : "subsequent" as const,
    priorQualifyingPurchases: input.priorQualifyingPurchases,
    refundedLamports: "0",
    status: "eligible" as const,
    payoutsEnabled: false as const,
  };
}

/** Cumulative reversal. This never debits a wallet. */
export function reviewCommissionReversal(input: {
  grossLamports: bigint;
  commissionLamports: bigint;
  previousRefundedLamports: bigint;
  totalRefundedLamports: bigint;
}) {
  const { grossLamports: gross, commissionLamports: original, previousRefundedLamports: previous, totalRefundedLamports: total } = input;
  if (gross <= BigInt("0") || original > gross || previous > total || total > gross) throw new Error("Invalid cumulative refund.");
  const previousReversal = (original * previous) / gross;
  const totalReversal = (original * total) / gross;
  return {
    deltaLamports: (totalReversal - previousReversal).toString(),
    reversedCommissionLamports: totalReversal.toString(),
    retainedCommissionLamports: (original - totalReversal).toString(),
    fullyReversed: total === gross,
    payoutsEnabled: false as const,
  };
}
