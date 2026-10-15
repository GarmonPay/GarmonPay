import { randomBytes, randomUUID } from "crypto";
import { ADVERTISING_TIERS, assertCampaignDraft } from "./advertising";
import { PAPER_STARTING_LAMPORTS, assertNotFinancialSettlement, parseSolToLamports } from "./economics";
import { referralToken } from "./invites";
import { applyPaperFill, displayToMicroUnits, type PaperSymbol } from "./paper";
import { accrueQualifyingPurchase, reviewCommissionReversal } from "./referrals";
import { normalizeBiography, normalizeDisplayName, normalizeHandle } from "./social";
import { emptyLedger, type LedgerState, type Member } from "./types";
import { reviewWatchCompletion } from "./watch";

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function inviteCode(state: LedgerState): string {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = Array.from(randomBytes(8), (byte) => ALPHABET[byte % ALPHABET.length]).join("");
    if (!state.members.some((member) => member.inviteCode === code)) return code;
  }
  throw new Error("Could not issue an invite code. Try again.");
}

function activity(state: LedgerState, memberId: string, text: string, at: string, isPublic = true) {
  state.activity.unshift({ id: randomUUID(), memberId, at, text, public: isPublic });
}

export function createMember(state: LedgerState, input: { displayName: string; handle: string; inviteCode?: string | null }, now = new Date().toISOString()): { state: LedgerState; member: Member } {
  assertNotFinancialSettlement({ pays: false, charges: false, broadcasts: false });
  const next: LedgerState = structuredClone(state);
  const handle = normalizeHandle(input.handle);
  if (next.members.some((member) => member.handle === handle)) throw new Error("That handle is already taken.");
  const displayName = normalizeDisplayName(input.displayName);
  let referredBy: string | null = null;
  const token = input.inviteCode ? referralToken(input.inviteCode) : null;
  if (input.inviteCode && !token) throw new Error("That invite code is not valid.");
  if (token && /^[0-9a-f]{32}$/.test(token)) throw new Error("Legacy registration links stay on /r. Staging invites use /member/join.");
  if (token) {
    const referrer = next.members.find((member) => member.inviteCode === token);
    if (!referrer) throw new Error("That invite code is not active.");
    referredBy = referrer.id;
  }
  const member: Member = {
    id: randomUUID(),
    handle,
    displayName,
    biography: "",
    inviteCode: inviteCode(next),
    referredBy,
    verified: false,
    profilePublic: true,
    createdAt: now,
    paperCashLamports: PAPER_STARTING_LAMPORTS.toString(),
    positions: {},
  };
  if (referredBy && referredBy === member.id) throw new Error("Self-referral denied.");
  next.members.push(member);
  activity(next, member.id, "Joined the member workspace.", now);
  if (referredBy) {
    const referrer = next.members.find((item) => item.id === referredBy);
    activity(next, referrer?.id ?? referredBy, `Direct referral attributed: @${handle}. Unverified staging profiles are not payable.`, now);
  }
  return { state: next, member };
}

export function updateMember(state: LedgerState, memberId: string, input: { displayName?: string; biography?: string; profilePublic?: boolean }): LedgerState {
  assertNotFinancialSettlement({ pays: false, charges: false, broadcasts: false });
  const next = structuredClone(state);
  const member = requireMember(next, memberId);
  if (input.displayName !== undefined) member.displayName = normalizeDisplayName(input.displayName);
  if (input.biography !== undefined) member.biography = normalizeBiography(input.biography);
  if (input.profilePublic !== undefined) member.profilePublic = input.profilePublic === true;
  member.verified = false;
  return next;
}

export function setFollow(state: LedgerState, followerId: string, handle: string, follow: boolean, now = new Date().toISOString()): LedgerState {
  assertNotFinancialSettlement({ pays: false, charges: false, broadcasts: false });
  const next = structuredClone(state);
  const follower = requireMember(next, followerId);
  const target = next.members.find((member) => member.handle === normalizeHandle(handle));
  if (!target) throw new Error("That member was not found.");
  if (target.id === follower.id) throw new Error("You cannot follow yourself.");
  const exists = next.follows.some((item) => item.followerId === follower.id && item.targetId === target.id);
  if (follow && !exists) {
    next.follows.push({ followerId: follower.id, targetId: target.id, at: now });
    activity(next, follower.id, `Followed @${target.handle}.`, now);
  }
  if (!follow && exists) next.follows = next.follows.filter((item) => !(item.followerId === follower.id && item.targetId === target.id));
  return next;
}

export function saveCampaign(state: LedgerState, ownerId: string, input: { title: string; url: string; tier: string; views: number }, now = new Date().toISOString()) {
  assertNotFinancialSettlement({ pays: false, charges: false, broadcasts: false });
  const draft = assertCampaignDraft(input);
  const next = structuredClone(state);
  requireMember(next, ownerId);
  const campaign = {
    id: randomUUID(),
    ownerId,
    title: draft.title,
    url: draft.url,
    tier: draft.tier,
    views: draft.views,
    status: "draft" as const,
    paymentEnabled: false as const,
    createdAt: now,
  };
  next.campaigns.unshift(campaign);
  activity(next, ownerId, `Saved advertising draft “${draft.title}”. No payment was collected.`, now);
  return { state: next, campaign };
}

export function startWatch(state: LedgerState, memberId: string, campaignId: string, nowMs = Date.now()) {
  assertNotFinancialSettlement({ pays: false, charges: false, broadcasts: false });
  const next = structuredClone(state);
  const member = requireMember(next, memberId);
  const campaign = next.campaigns.find((item) => item.id === campaignId);
  if (!campaign) throw new Error("That campaign draft was not found.");
  if (campaign.ownerId === member.id) throw new Error("You cannot verify a view on your own campaign.");
  if (next.watches.some((item) => item.memberId === member.id && item.campaignId === campaign.id && item.status === "verified")) {
    throw new Error("This member already has a verified view on this campaign.");
  }
  if (next.watches.some((item) => item.memberId === member.id && item.campaignId === campaign.id && item.status === "watching")) {
    throw new Error("A view is already open for this campaign.");
  }
  const verified = next.watches.filter((item) => item.campaignId === campaign.id && item.status === "verified").length;
  if (verified >= campaign.views) throw new Error("This draft has no remaining view capacity.");
  const seconds = ADVERTISING_TIERS[campaign.tier].seconds;
  const session = {
    id: randomUUID(),
    memberId: member.id,
    campaignId: campaign.id,
    requiredSeconds: seconds,
    startedAtMs: nowMs,
    heartbeats: 0,
    status: "watching" as const,
    reason: null,
    completedAtMs: null,
    payoutsEnabled: false as const,
    funded: false as const,
  };
  next.watches.unshift(session);
  return { state: next, session };
}

export function heartbeatWatch(state: LedgerState, memberId: string, watchId: string): LedgerState {
  const next = structuredClone(state);
  const session = next.watches.find((item) => item.id === watchId && item.memberId === memberId);
  if (!session || session.status !== "watching") throw new Error("That view is not open.");
  session.heartbeats += 1;
  return next;
}

export function completeWatch(state: LedgerState, memberId: string, watchId: string, input: { nowMs: number; webdriver: boolean }) {
  assertNotFinancialSettlement({ pays: false, charges: false, broadcasts: false });
  const next = structuredClone(state);
  const session = next.watches.find((item) => item.id === watchId && item.memberId === memberId);
  if (!session) throw new Error("That view was not found.");
  const campaign = next.campaigns.find((item) => item.id === session.campaignId);
  const alreadyVerified = next.watches.some((item) => item.id !== session.id && item.memberId === memberId && item.campaignId === session.campaignId && item.status === "verified");
  const decision = reviewWatchCompletion({
    session,
    nowMs: input.nowMs,
    heartbeats: session.heartbeats,
    webdriver: input.webdriver,
    alreadyVerified,
    ownsCampaign: campaign?.ownerId === memberId,
  });
  if (!decision.ok) {
    session.status = "rejected";
    session.reason = decision.reason;
    session.completedAtMs = input.nowMs;
    return { state: next, session };
  }
  session.status = "verified";
  session.completedAtMs = input.nowMs;
  session.funded = false;
  session.payoutsEnabled = false;
  activity(next, memberId, "Server-verified a view. The reward is not funded and was not paid.", new Date(input.nowMs).toISOString());
  return { state: next, session };
}

export function recordPaperFill(state: LedgerState, memberId: string, input: {
  symbol: PaperSymbol;
  side: "buy" | "sell";
  spendSol?: string;
  sellUnits?: string;
  tokenMicrousd: bigint;
  solMicrousd: bigint;
  priceSource: string;
  at?: string;
}) {
  assertNotFinancialSettlement({ pays: false, charges: false, broadcasts: false });
  const next = structuredClone(state);
  const member = requireMember(next, memberId);
  const position = member.positions[input.symbol];
  const spendLamports = input.side === "buy" ? parseSpend(input.spendSol) : undefined;
  const sellMicroUnits = input.side === "sell" ? displayToMicroUnits(input.sellUnits ?? "") : undefined;
  if (input.side === "sell" && !sellMicroUnits) throw new Error("Enter the paper amount to sell.");
  const fill = applyPaperFill({
    cashLamports: BigInt(member.paperCashLamports),
    position: position ? { microUnits: BigInt(position.microUnits), costLamports: BigInt(position.costLamports) } : null,
    side: input.side,
    spendLamports,
    sellMicroUnits: sellMicroUnits ?? undefined,
    tokenMicrousd: input.tokenMicrousd,
    solMicrousd: input.solMicrousd,
  });
  member.paperCashLamports = fill.cashLamports.toString();
  if (fill.position) member.positions[input.symbol] = { microUnits: fill.position.microUnits.toString(), costLamports: fill.position.costLamports.toString() };
  else delete member.positions[input.symbol];
  const at = input.at ?? new Date().toISOString();
  next.paperFills.push({
    id: randomUUID(),
    memberId,
    symbol: input.symbol,
    side: input.side,
    virtualLamports: fill.virtualLamports.toString(),
    microUnits: fill.microUnits.toString(),
    priceMicrousd: input.tokenMicrousd.toString(),
    solPriceMicrousd: input.solMicrousd.toString(),
    priceSource: input.priceSource,
    realizedLamports: fill.realizedLamports.toString(),
    at,
  });
  activity(next, memberId, `Recorded a paper ${input.side} of ${input.symbol}. Virtual only — not a real asset.`, at);
  return { state: next, cashLamports: member.paperCashLamports };
}

/** Test and future receipt hook. Staging profiles cannot call this because verified is always false. */
export function recordQualifyingPurchase(state: LedgerState, input: { advertiserId: string; purchaseId: string; grossLamports: bigint; at?: string }) {
  assertNotFinancialSettlement({ pays: false, charges: false, broadcasts: false });
  const next = structuredClone(state);
  const advertiser = requireMember(next, input.advertiserId);
  if (!advertiser.referredBy) throw new Error("This member has no direct referrer.");
  const priorQualifyingPurchases = next.commissions.filter((item) => item.advertiserId === advertiser.id && item.referrerId === advertiser.referredBy && item.status === "eligible").length;
  const event = accrueQualifyingPurchase({
    referrerId: advertiser.referredBy,
    advertiserId: advertiser.id,
    advertiserVerified: advertiser.verified,
    purchaseId: input.purchaseId,
    grossLamports: input.grossLamports,
    priorQualifyingPurchases,
    existingPurchaseIds: next.commissions.map((item) => item.purchaseId),
  });
  next.commissions.push({ ...event, id: randomUUID(), at: input.at ?? new Date().toISOString() });
  return next;
}

/** Records a cumulative refund against an eligible commission. A full refund no longer counts as a prior purchase. */
export function recordCommissionRefund(state: LedgerState, input: { purchaseId: string; totalRefundedLamports: bigint }) {
  assertNotFinancialSettlement({ pays: false, charges: false, broadcasts: false });
  const next = structuredClone(state);
  const event = next.commissions.find((item) => item.purchaseId === input.purchaseId);
  if (!event || event.status === "reversed") throw new Error("That commission is not eligible for a refund review.");
  const review = reviewCommissionReversal({
    grossLamports: BigInt(event.grossLamports),
    commissionLamports: BigInt(event.commissionLamports),
    previousRefundedLamports: BigInt(event.refundedLamports),
    totalRefundedLamports: input.totalRefundedLamports,
  });
  event.refundedLamports = input.totalRefundedLamports.toString();
  if (review.fullyReversed) event.status = "reversed";
  return { state: next, review };
}

export function requireMember(state: LedgerState, memberId: string): Member {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(memberId)) throw new Error("Open your member profile again.");
  const member = state.members.find((item) => item.id === memberId);
  if (!member) throw new Error("That member profile was not found on this server.");
  return member;
}

function parseSpend(raw: string | undefined): bigint {
  const lamports = parseSolToLamports(raw ?? "");
  if (!lamports) throw new Error("Enter a virtual SOL amount.");
  return lamports;
}

export { emptyLedger };
