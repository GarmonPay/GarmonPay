import { ECONOMICS_VERSION, formatLamports, PAYMENT_ENABLED, PAYOUTS_ENABLED } from "./economics";
import { memberIdentityContract } from "./identity";
import { rankPaperTraders, rankVerifiedLive } from "./leaderboard";
import { publicProfileView } from "./social";
import type { LedgerState } from "./types";
import { walletAuthEnabled } from "@/lib/solana/policy";
import { FINANCIAL_OPERATIONS_PAUSED } from "@/lib/security/financial-pause";

const SHORTCUTS = [
  { href: "/member/referrals", label: "Referrals", detail: "Direct invites, history, and the commission calculator." },
  { href: "/member/advertising", label: "Advertising", detail: "Prepaid campaign drafts. Payment stays off." },
  { href: "/member/watch", label: "Watch & Earn", detail: "Server-verified views. Rewards are not funded." },
  { href: "/member/paper", label: "Paper trading", detail: "Virtual SOL only. Real prices when a quote is available." },
  { href: "/member/traders", label: "Top 100", detail: "Paper and verified-live boards stay separate." },
  { href: "/member/community", label: "Community", detail: "Public profiles and follows." },
  { href: "/member/create", label: "Coin creator", detail: "Names, tickers, and a copyable artwork prompt." },
];

export function buildSnapshot(state: LedgerState, memberId: string | null, nowMs = Date.now()) {
  const member = memberId ? state.members.find((item) => item.id === memberId) ?? null : null;
  const directs = member ? state.members.filter((item) => item.referredBy === member.id) : [];
  const eligible = member ? state.commissions.filter((item) => item.referrerId === member.id && item.status === "eligible") : [];
  const commission = eligible.reduce((sum, item) => sum + BigInt(item.commissionLamports), BigInt("0"));
  const verifiedViews = member ? state.watches.filter((item) => item.memberId === member.id && item.status === "verified").length : 0;
  const activity = member
    ? state.activity.filter((item) => item.memberId === member.id).slice(0, 12).map((item) => ({ text: item.text, at: item.at }))
    : [];
  return {
    economicsVersion: ECONOMICS_VERSION,
    identity: memberIdentityContract(),
    walletAuthEnabled: walletAuthEnabled(),
    walletConnected: false,
    financialOperationsPaused: FINANCIAL_OPERATIONS_PAUSED,
    paymentEnabled: PAYMENT_ENABLED,
    payoutsEnabled: PAYOUTS_ENABLED,
    profile: member ? {
      handle: member.handle,
      displayName: member.displayName,
      biography: member.biography,
      profilePublic: member.profilePublic,
      inviteCode: member.inviteCode,
      invitePath: `/member/join/${member.inviteCode}`,
      verified: member.verified,
      followers: state.follows.filter((item) => item.targetId === member.id).length,
      following: state.follows.filter((item) => item.followerId === member.id).length,
      createdAt: member.createdAt,
    } : null,
    earnings: {
      fundedLamports: null,
      eligibleCommissionLamports: member ? commission.toString() : null,
      eligibleCommissionSol: member ? formatLamports(commission) : null,
      verifiedViews: member ? verifiedViews : null,
      note: "Eligible figures are accounting records. They are not balances, and payouts are paused.",
    },
    referrals: {
      direct: directs.map((item) => ({ handle: item.handle, displayName: item.displayName, at: item.createdAt, verified: item.verified })),
      historyNote: "Direct referrals only. Ownership is stored with the signed wallet. Commissions are not paid.",
    },
    advertising: {
      drafts: member ? state.campaigns.filter((item) => item.ownerId === member.id).length : 0,
    },
    paper: member ? {
      cashLamports: member.paperCashLamports,
      cashSol: formatLamports(member.paperCashLamports),
      label: "virtual SOL",
      positions: Object.entries(member.positions).map(([symbol, position]) => ({ symbol, microUnits: position.microUnits })),
      fills: state.paperFills.filter((item) => item.memberId === member.id).sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id)).slice(0, 100).map((item) => ({
        id: item.id,
        microUnits: item.microUnits,
        virtualLamports: item.virtualLamports,
        symbol: item.symbol,
        side: item.side,
        at: item.at,
        priceSource: item.priceSource,
        realizedLamports: item.realizedLamports,
      })),
    } : null,
    campaigns: member ? state.campaigns.filter((item) => item.ownerId === member.id).map((item) => ({
      id: item.id,
      title: item.title,
      url: item.url,
      tier: item.tier,
      views: item.views,
      verified: state.watches.filter((watch) => watch.campaignId === item.id && watch.status === "verified").length,
      paymentEnabled: item.paymentEnabled,
    })) : [],
    watchable: member ? state.campaigns.filter((item) => item.ownerId !== member.id).map((item) => ({
      id: item.id,
      title: item.title,
      tier: item.tier,
      views: item.views,
      verified: state.watches.filter((watch) => watch.campaignId === item.id && watch.status === "verified").length,
      open: state.watches.find((watch) => watch.memberId === member.id && watch.campaignId === item.id && watch.status === "watching")?.id ?? null,
    })) : [],
    activity,
    shortcuts: SHORTCUTS,
    traders: {
      paperDaily: rankPaperTraders({
        nowMs,
        period: "daily",
        members: state.members,
        fills: state.paperFills,
      }).length,
      verifiedLive: rankVerifiedLive().rows.length,
    },
  };
}

export function buildPublicProfile(state: LedgerState, handle: string, viewerId: string | null) {
  const member = state.members.find((item) => item.handle === handle);
  if (!member) return null;
  const viewer = viewerId ? state.members.find((item) => item.id === viewerId) : null;
  return publicProfileView({
    handle: member.handle,
    displayName: member.displayName,
    biography: member.biography,
    profilePublic: member.profilePublic,
    followers: state.follows.filter((item) => item.targetId === member.id).length,
    following: state.follows.filter((item) => item.followerId === member.id).length,
    isFollowing: Boolean(viewer && state.follows.some((item) => item.followerId === viewer.id && item.targetId === member.id)),
    activity: state.activity.filter((item) => item.memberId === member.id && item.public).slice(0, 20).map((item) => ({ text: item.text, at: item.at })),
  });
}

export function searchMembers(state: LedgerState, query: string) {
  const needle = query.trim().toLowerCase().slice(0, 32);
  return state.members
    .filter((member) => member.profilePublic)
    .filter((member) => !needle || member.handle.includes(needle) || member.displayName.toLowerCase().includes(needle))
    .slice(0, 20)
    .map((member) => ({
      handle: member.handle,
      displayName: member.displayName,
      biography: member.biography.slice(0, 140),
      followers: state.follows.filter((item) => item.targetId === member.id).length,
    }));
}
