import type { WatchSession } from "./types";

export function reviewWatchCompletion(input: {
  session: WatchSession;
  nowMs: number;
  heartbeats: number;
  webdriver: boolean;
  alreadyVerified: boolean;
  ownsCampaign: boolean;
}) {
  if (input.ownsCampaign) return { ok: false as const, reason: "You cannot verify a view on your own campaign." };
  if (input.session.status !== "watching") return { ok: false as const, reason: "This view is no longer open." };
  if (input.webdriver) return { ok: false as const, reason: "Automated browsers cannot claim a verified view." };
  if (input.alreadyVerified) return { ok: false as const, reason: "This member already has a verified view on this campaign." };
  if (input.heartbeats < 1) return { ok: false as const, reason: "The view did not stay open long enough to verify." };
  if (!Number.isSafeInteger(input.nowMs) || input.nowMs < input.session.startedAtMs) return { ok: false as const, reason: "The server clock rejected this view." };
  if (input.nowMs - input.session.startedAtMs < input.session.requiredSeconds * 1000) {
    return { ok: false as const, reason: "The view finished before the required time." };
  }
  return { ok: true as const, reason: null };
}
