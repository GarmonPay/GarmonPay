/** Server-side staging quote arithmetic. No payment or reward authorization. */
export const ADVERTISING_TIERS = Object.freeze({
  click5: { seconds: 5, priceMicrousdPerThousand: "3000000", rewardMicrousdPerView: "300" },
  view15: { seconds: 15, priceMicrousdPerThousand: "8000000", rewardMicrousdPerView: "1000" },
  view30: { seconds: 30, priceMicrousdPerThousand: "15000000", rewardMicrousdPerView: "2000" },
});
const ceiling = (n: bigint, d: bigint) => (n + d - BigInt(1)) / d;
export function quoteAdvertisingPurchase(input: {
  tier: keyof typeof ADVERTISING_TIERS; views: number; solPriceMicrousd: string;
  rateObservedAt: number; now: number; pricingVersion: string;
}) {
  if (!Object.hasOwn(ADVERTISING_TIERS, input.tier)) throw new Error("Approved advertising tier required");
  if (!Number.isSafeInteger(input.views) || input.views < 1000 || input.views > 1000000 || input.views % 1000) throw new Error("Purchase views in increments of 1,000");
  if (!/^[1-9][0-9]{0,14}$/.test(input.solPriceMicrousd)) throw new Error("Positive bounded SOL/USD rate required");
  if (![input.now,input.rateObservedAt].every(Number.isSafeInteger) || input.rateObservedAt > input.now || input.now-input.rateObservedAt > 60000) throw new Error("Fresh verified rate required");
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(input.pricingVersion)) throw new Error("Approved pricing version required");
  const tier=ADVERTISING_TIERS[input.tier], price=BigInt(tier.priceMicrousdPerThousand);
  const purchase=price*BigInt(input.views/1000);
  if (purchase < BigInt(5000000)) throw new Error("Checkout must reach $5; select additional view blocks");
  const rate=BigInt(input.solPriceMicrousd), scale=BigInt(1000000000);
  // Reserve per-view promises rounded up; never silently reduce viewer rewards.
  const reward=ceiling(BigInt(tier.rewardMicrousdPerView)*scale,rate);
  const viewerReserve=reward*BigInt(input.views);
  const referralMatchPerView=ceiling(reward,BigInt(2));
  const referralReserve=referralMatchPerView*BigInt(input.views);
  const gross=ceiling(purchase*scale,rate);
  if (viewerReserve+referralReserve>gross) throw new Error("Rate precision cannot fund promised rewards");
  return {tier:input.tier,views:input.views,requiredSeconds:tier.seconds,pricingVersion:input.pricingVersion,
    purchaseMicrousd:purchase.toString(),grossLamports:gross.toString(),viewerLamportsPerView:reward.toString(),
    viewerReserveLamports:viewerReserve.toString(),viewerReferralMatchLamportsPerView:referralMatchPerView.toString(),
    viewerReferralReserveLamports:referralReserve.toString(),rateMicrousd:rate.toString(),
    expiresAt:input.rateObservedAt+60000,paymentEnabled:false as const};
}
