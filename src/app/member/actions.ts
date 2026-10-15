"use server";

import { saveCampaign, completeWatch, createMember, heartbeatWatch, recordPaperFill, setFollow, startWatch, updateMember } from "@/lib/member-platform/books";
import { PAPER_SYMBOLS, type PaperSymbol } from "@/lib/member-platform/paper";
import { lookupUsdPrice } from "@/lib/member-platform/prices";
import { mutateLedger } from "@/lib/member-platform/repository";

function fail(error: unknown) {
  return { ok: false as const, error: error instanceof Error ? error.message : "That action could not be completed." };
}

export async function createStagingMember(input: { displayName: string; handle: string; inviteCode?: string }) {
  try {
    const member = mutateLedger((state) => {
      const created = createMember(state, input);
      return { state: created.state, result: created.member };
    });
    return { ok: true as const, id: member.id, handle: member.handle };
  } catch (error) { return fail(error); }
}

export async function saveMemberProfile(input: { memberId: string; displayName: string; biography: string; profilePublic: boolean }) {
  try {
    mutateLedger((state) => ({ state: updateMember(state, input.memberId, input), result: true }));
    return { ok: true as const };
  } catch (error) { return fail(error); }
}

export async function followHandle(input: { memberId: string; handle: string; follow: boolean }) {
  try {
    mutateLedger((state) => ({ state: setFollow(state, input.memberId, input.handle, input.follow), result: true }));
    return { ok: true as const };
  } catch (error) { return fail(error); }
}

export async function saveAdvertisingDraft(input: { memberId: string; title: string; url: string; tier: string; views: number }) {
  try {
    const campaign = mutateLedger((state) => {
      const saved = saveCampaign(state, input.memberId, input);
      return { state: saved.state, result: saved.campaign };
    });
    return { ok: true as const, id: campaign.id, paymentEnabled: false as const };
  } catch (error) { return fail(error); }
}

export async function openVerifiedView(input: { memberId: string; campaignId: string }) {
  try {
    const session = mutateLedger((state) => {
      const opened = startWatch(state, input.memberId, input.campaignId);
      return { state: opened.state, result: opened.session };
    });
    return { ok: true as const, watchId: session.id, requiredSeconds: session.requiredSeconds };
  } catch (error) { return fail(error); }
}

export async function pulseVerifiedView(input: { memberId: string; watchId: string }) {
  try {
    mutateLedger((state) => ({ state: heartbeatWatch(state, input.memberId, input.watchId), result: true }));
    return { ok: true as const };
  } catch (error) { return fail(error); }
}

export async function finishVerifiedView(input: { memberId: string; watchId: string; webdriver: boolean }) {
  try {
    const session = mutateLedger((state) => {
      const done = completeWatch(state, input.memberId, input.watchId, { nowMs: Date.now(), webdriver: input.webdriver });
      return { state: done.state, result: done.session };
    });
    return { ok: true as const, status: session.status, reason: session.reason, funded: false as const, payoutsEnabled: false as const };
  } catch (error) { return fail(error); }
}

export async function submitPaperFill(input: { memberId: string; symbol: string; side: "buy" | "sell"; amount: string }) {
  const symbol = input.symbol.toUpperCase();
  if (!PAPER_SYMBOLS.includes(symbol as PaperSymbol)) return { ok: false as const, error: "Choose BTC or ETH. Other symbols have no verified price here." };
  const [sol, token] = await Promise.all([lookupUsdPrice("SOL"), lookupUsdPrice(symbol)]);
  if (!sol || !token) return { ok: false as const, error: "A live price is unavailable. No paper fill was recorded." };
  try {
    const cash = mutateLedger((state) => {
      const recorded = recordPaperFill(state, input.memberId, {
        symbol: symbol as PaperSymbol,
        side: input.side,
        spendSol: input.side === "buy" ? input.amount : undefined,
        sellUnits: input.side === "sell" ? input.amount : undefined,
        tokenMicrousd: BigInt(token.microusd),
        solMicrousd: BigInt(sol.microusd),
        priceSource: token.source,
      });
      return { state: recorded.state, result: recorded.cashLamports };
    });
    return { ok: true as const, cashLamports: cash, priceSource: token.source, virtual: true as const };
  } catch (error) { return fail(error); }
}
