"use server";

import { followWalletHandle, recordWalletPaperFill, saveWalletDraft, saveWalletProfile } from "@/lib/member-platform/wallet-account";

function fail(error: unknown) {
  return { ok: false as const, error: error instanceof Error ? error.message : "That action could not be completed." };
}

export async function createStagingMember(_input: { displayName: string; handle: string; inviteCode?: string }) {
  return { ok: false as const, error: "Staging profiles are not member accounts. Connect and sign in with your wallet." };
}

export async function saveMemberProfile(input: { memberId?: string; displayName: string; biography: string; walletPublic: boolean; handle?: string }) {
  try {
    await saveWalletProfile(input);
    return { ok: true as const };
  } catch (error) { return fail(error); }
}

export async function followHandle(input: { memberId?: string; handle: string; follow: boolean }) {
  try {
    await followWalletHandle(input);
    return { ok: true as const };
  } catch (error) { return fail(error); }
}

export async function saveAdvertisingDraft(input: { memberId?: string; title: string; url: string; tier: string; views: number }) {
  try {
    const campaign = await saveWalletDraft(input);
    return { ok: true as const, id: campaign.id, paymentEnabled: false as const };
  } catch (error) { return fail(error); }
}

export async function openVerifiedView(_input: { memberId?: string; campaignId: string }) {
  return { ok: false as const, error: "Verified views are not funded, and a staging ID cannot open one." };
}

export async function pulseVerifiedView(_input: { memberId?: string; watchId: string }) {
  return { ok: false as const, error: "Verified views are not funded, and a staging ID cannot open one." };
}

export async function finishVerifiedView(_input: { memberId?: string; watchId: string; webdriver: boolean }) {
  return { ok: false as const, status: "rejected" as const, reason: "Verified views are not funded.", funded: false as const, payoutsEnabled: false as const, error: "Verified views are not funded." };
}

export async function submitPaperFill(input: { memberId?: string; symbol: string; side: "buy" | "sell"; amount: string }) {
  try {
    const recorded = await recordWalletPaperFill(input);
    return { ok: true as const, cashLamports: recorded.cashLamports, priceSource: recorded.priceSource, virtual: true as const };
  } catch (error) { return fail(error); }
}
