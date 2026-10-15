/** Documented LaunchLab caps and the public devnet SOL config. Not a live quote. */
export const LAUNCH_FEE_FACTS = Object.freeze({
  denominator: "1000000",
  platformFeeCap: "50000",
  creatorFeeCap: "5000",
  protocolTradeFeeRate: "2500",
  maxShareFeeRate: "10000",
  priorPlatformFee: "6000",
  priorCreatorFee: "4000",
  largerPlatformFee: "12000",
  largerCreatorFee: "3000",
  holderRewards: "unsupported" as const,
  postGraduationCreatorScale: "0",
  garmonPayLaunchFeeCharged: false as const,
});

export type FeeSplit = { platform: string; creator: string };

export function feeSplitFitsCaps(split: FeeSplit) {
  const platform = BigInt(split.platform);
  const creator = BigInt(split.creator);
  const platformCap = BigInt(LAUNCH_FEE_FACTS.platformFeeCap);
  const creatorCap = BigInt(LAUNCH_FEE_FACTS.creatorFeeCap);
  const reasons: string[] = [];
  if (platform < BigInt(0) || platform > platformCap) reasons.push("Platform fee is outside the documented 5% cap.");
  if (creator < BigInt(0) || creator > creatorCap) reasons.push("Creator fee is outside the documented 0.50% cap.");
  if (platform <= creator) reasons.push("GarmonPay's platform fee must be larger than the creator fee.");
  const protocol = BigInt(LAUNCH_FEE_FACTS.protocolTradeFeeRate);
  return {
    supported: reasons.length === 0,
    reasons,
    allInRate: (protocol + platform + creator).toString(),
    protocolRate: LAUNCH_FEE_FACTS.protocolTradeFeeRate,
    appliesToBuyAndSell: true as const,
  };
}

/** Million-denominator rate as a percent label. 12000 is 1.20%. */
export function formatFeePercent(rate: string) {
  const value = Number(rate);
  if (!Number.isFinite(value)) return "—";
  return `${(value / 10_000).toFixed(2)}%`;
}

export function describeTradingFees() {
  const larger = feeSplitFitsCaps({ platform: LAUNCH_FEE_FACTS.largerPlatformFee, creator: LAUNCH_FEE_FACTS.largerCreatorFee });
  const prior = feeSplitFitsCaps({ platform: LAUNCH_FEE_FACTS.priorPlatformFee, creator: LAUNCH_FEE_FACTS.priorCreatorFee });
  return {
    ...LAUNCH_FEE_FACTS,
    largerSplitFitsDocumentedCaps: larger.supported,
    largerAllInRate: larger.allInRate,
    priorSplitFitsDocumentedCaps: prior.supported,
    priorAllInRate: prior.allInRate,
    buyAndSellUseSameCurveRates: true as const,
    productionLaunchEnabled: false as const,
  };
}

export type LaunchProgress = { mintExists: boolean; poolExists: boolean; sellConfirmed: boolean; memory: "none" | "failed" | "confirmed" };

/** Restart-safe decision. An existing mint is never initialized again. */
export function nextLaunchAction(state: LaunchProgress) {
  if (state.memory === "confirmed" || (state.mintExists && state.poolExists && state.sellConfirmed)) return "stop" as const;
  if (state.mintExists && state.poolExists) return "sell-only" as const;
  if (state.mintExists) return "incomplete-stop" as const;
  return "create" as const;
}

export function launchMetadataUri(input: { name: string; symbol: string; description: string; keywords: string }) {
  const name = input.name.trim().slice(0, 32);
  const symbol = input.symbol.trim().slice(0, 10);
  if (!name || !/^[A-Za-z0-9]{1,10}$/.test(symbol)) throw new Error("Token name and ticker are required");
  let description = input.description.trim().slice(0, 120);
  const keywords = input.keywords.trim().slice(0, 80);
  const build = (text: string, words: string) => `data:application/json,${encodeURIComponent(JSON.stringify({ name, symbol, description: text, keywords: words }))}`;
  let uri = build(description, keywords);
  while (uri.length > 200 && (description.length > 0 || keywords.length > 0)) {
    if (description.length > 0) description = description.slice(0, -1);
    else break;
    uri = build(description, "");
  }
  if (uri.length > 200) throw new Error("Metadata URI is too long");
  return { uri, name, symbol, descriptionStored: description.length > 0, keywordsStored: uri.includes(encodeURIComponent(keywords)) && keywords.length > 0, artworkStored: false as const };
}
