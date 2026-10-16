import { ECONOMICS_VERSION, MIN_PURCHASE_MICROUSD, PACKAGE_VIEWS, VIEWER_MATCH_BPS } from "./economics";

/** Prepaid packages of 1,000 verified views or clicks. The 5-second package meets the $9.99 minimum. Funding stays paused. */
export const ADVERTISING_TIERS = Object.freeze({
  seconds5: { seconds: 5, views: PACKAGE_VIEWS, priceMicrousd: "9990000", label: "5 seconds" },
  seconds15: { seconds: 15, views: PACKAGE_VIEWS, priceMicrousd: "9990000", label: "15 seconds" },
  seconds30: { seconds: 30, views: PACKAGE_VIEWS, priceMicrousd: "14990000", label: "30 seconds" },
  seconds60: { seconds: 60, views: PACKAGE_VIEWS, priceMicrousd: "24990000", label: "60 seconds" },
});

export type AdTier = keyof typeof ADVERTISING_TIERS;

const ceiling = (n: bigint, d: bigint) => (n + d - BigInt("1")) / d;

export function assertCampaignDraft(input: { title: string; url: string; tier: string; views: number }) {
  const title = input.title.trim();
  if (!title || title.length > 80) throw new Error("Enter a campaign name up to 80 characters.");
  if (!Object.hasOwn(ADVERTISING_TIERS, input.tier)) throw new Error("Choose an approved advertising package.");
  const tier = ADVERTISING_TIERS[input.tier as AdTier];
  if (input.views !== tier.views || input.views < PACKAGE_VIEWS) throw new Error("Each package is 1,000 verified views or clicks.");
  if (BigInt(tier.priceMicrousd) < BigInt(MIN_PURCHASE_MICROUSD)) throw new Error("Each package must cost at least $9.99.");
  let url: URL;
  try { url = new URL(input.url); } catch { throw new Error("Use a valid HTTPS destination."); }
  if (url.protocol !== "https:" || url.username || url.password || input.url.length > 200) {
    throw new Error("Use an HTTPS destination without embedded credentials.");
  }
  return {
    title,
    url: url.toString(),
    tier: input.tier as AdTier,
    views: tier.views,
    seconds: tier.seconds,
    purchaseMicrousd: tier.priceMicrousd,
    economicsVersion: ECONOMICS_VERSION,
  };
}

/** SOL conversion is staging arithmetic. It does not collect a payment or invent a viewer reward. */
export function quoteCampaignSol(input: {
  tier: AdTier;
  views: number;
  solPriceMicrousd: string;
  rateObservedAt: number;
  now: number;
}) {
  const draft = assertCampaignDraft({ title: "Quote", url: "https://example.com", tier: input.tier, views: input.views });
  if (!/^[1-9][0-9]{0,14}$/.test(input.solPriceMicrousd)) throw new Error("A positive SOL/USD rate is required.");
  if (![input.now, input.rateObservedAt].every(Number.isSafeInteger) || input.rateObservedAt > input.now || input.now - input.rateObservedAt > 60_000) {
    throw new Error("A fresh SOL/USD rate is required. No estimated rate was substituted.");
  }
  const rate = BigInt(input.solPriceMicrousd);
  const scale = BigInt("1000000000");
  const gross = ceiling(BigInt(draft.purchaseMicrousd) * scale, rate);
  return {
    economicsVersion: ECONOMICS_VERSION,
    purchaseMicrousd: draft.purchaseMicrousd,
    views: draft.views,
    grossLamports: gross.toString(),
    requiredSeconds: draft.seconds,
    viewerRewardConfigured: false as const,
    viewerMatchBps: VIEWER_MATCH_BPS,
    paymentEnabled: false as const,
    payoutsEnabled: false as const,
  };
}

/** Owner-review scenario only. Every cost assumption is explicit; this never
 * configures a payout rate, funds a campaign, or authorizes checkout. USD micros. */
export function modelCampaignEconomics(input: {
  grossMicrousd: bigint; views: number; viewerMicrousdPerView: bigint;
  advertiserBps: 1000 | 500; processorBps: number; processorFlatMicrousd: bigint;
  operatingMicrousd: bigint; reserveBps: number;
}) {
  if (!Number.isSafeInteger(input.views) || input.views < 1000 || input.views > 1_000_000 || input.views % 1000) throw new Error("Bounded 1,000-view blocks required");
  if (input.grossMicrousd < BigInt(MIN_PURCHASE_MICROUSD)) throw new Error("The approved minimum is $9.99");
  if (![input.advertiserBps, input.processorBps, input.reserveBps].every(value => Number.isInteger(value) && value >= 0 && value <= 10000)
    || ![1000, 500].includes(input.advertiserBps)) throw new Error("Explicit bounded cost rates required");
  if ([input.viewerMicrousdPerView, input.processorFlatMicrousd, input.operatingMicrousd].some(value => typeof value !== "bigint" || value < BigInt(0))) throw new Error("Non-negative explicit cost assumptions required");
  const viewer = input.viewerMicrousdPerView * BigInt(input.views);
  const viewerMatch = ceiling(input.viewerMicrousdPerView * BigInt(VIEWER_MATCH_BPS), BigInt(10000)) * BigInt(input.views);
  const advertiser = ceiling(input.grossMicrousd * BigInt(input.advertiserBps), BigInt(10000));
  const processing = ceiling(input.grossMicrousd * BigInt(input.processorBps), BigInt(10000)) + input.processorFlatMicrousd;
  const reserve = ceiling(input.grossMicrousd * BigInt(input.reserveBps), BigInt(10000));
  const net = input.grossMicrousd - viewer - viewerMatch - advertiser - processing - input.operatingMicrousd - reserve;
  return { grossMicrousd: input.grossMicrousd, viewerMicrousd: viewer, viewerMatchMicrousd: viewerMatch,
    advertiserMicrousd: advertiser, processingMicrousd: processing, operatingMicrousd: input.operatingMicrousd,
    reserveMicrousd: reserve, netMicrousd: net, coversAssumptions: net >= BigInt(0),
    assumptionsApproved: false as const, paymentEnabled: false as const, payoutsEnabled: false as const };
}
