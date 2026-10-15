export type Member = {
  id: string;
  handle: string;
  displayName: string;
  biography: string;
  inviteCode: string;
  referredBy: string | null;
  verified: false;
  profilePublic: boolean;
  createdAt: string;
  paperCashLamports: string;
  positions: Record<string, { microUnits: string; costLamports: string }>;
};

export type ActivityItem = {
  id: string;
  memberId: string;
  at: string;
  text: string;
  public: boolean;
};

export type Follow = { followerId: string; targetId: string; at: string };

export type CampaignDraft = {
  id: string;
  ownerId: string;
  title: string;
  url: string;
  tier: "seconds5" | "seconds15" | "seconds30" | "seconds60";
  views: number;
  status: "draft";
  paymentEnabled: false;
  createdAt: string;
};

export type WatchSession = {
  id: string;
  memberId: string;
  campaignId: string;
  requiredSeconds: number;
  startedAtMs: number;
  heartbeats: number;
  status: "watching" | "verified" | "rejected";
  reason: string | null;
  completedAtMs: number | null;
  payoutsEnabled: false;
  funded: false;
};

export type PaperFill = {
  id: string;
  memberId: string;
  symbol: string;
  side: "buy" | "sell";
  virtualLamports: string;
  microUnits: string;
  priceMicrousd: string;
  solPriceMicrousd: string;
  priceSource: string;
  realizedLamports: string;
  at: string;
};

export type CommissionEvent = {
  id: string;
  referrerId: string;
  advertiserId: string;
  purchaseId: string;
  grossLamports: string;
  commissionLamports: string;
  rateBps: number;
  sequence: "first" | "subsequent";
  priorQualifyingPurchases: number;
  refundedLamports: string;
  status: "eligible" | "reversed";
  payoutsEnabled: false;
  at: string;
};

export type LedgerState = {
  members: Member[];
  activity: ActivityItem[];
  follows: Follow[];
  campaigns: CampaignDraft[];
  watches: WatchSession[];
  paperFills: PaperFill[];
  commissions: CommissionEvent[];
};

export function emptyLedger(): LedgerState {
  return { members: [], activity: [], follows: [], campaigns: [], watches: [], paperFills: [], commissions: [] };
}
