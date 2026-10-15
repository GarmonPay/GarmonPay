import { lamports } from "./amounts";
import { SOLANA_POLICY } from "./policy";
import { validateTokenMetadata } from "./token-metadata";

const RATE_DENOMINATOR = BigInt(1_000_000);
const MAX_QUOTE_AGE_MS = 60_000;

export type LaunchConfiguration = {
  currency: "SOL";
  curve: "virtual_constant_product";
  stage: "curve" | "graduated";
  fees: { denominator: string; protocol: string; platform: string; creator: string; creatorClaim: string };
};

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Complete launch data required");
  return value as Record<string, unknown>;
}
function rate(value: unknown): bigint {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,6})$/.test(value)) throw new Error("Invalid fee rate");
  const parsed = BigInt(value);
  if (parsed > RATE_DENOMINATOR) throw new Error("Invalid fee rate");
  return parsed;
}

/** Arithmetic compatibility only: input data does not prove on-chain authenticity. */
export function reviewLaunchConfiguration(input: unknown) {
  const config = object(input);
  const fees = object(config.fees);
  if (fees.denominator !== RATE_DENOMINATOR.toString()) throw new Error("Unsupported fee denominator");
  const protocol = rate(fees.protocol), platform = rate(fees.platform);
  const creator = rate(fees.creator), creatorClaim = rate(fees.creatorClaim);
  const total = protocol + platform + creator;
  const reasons: string[] = [];
  if (config.currency !== "SOL") reasons.push("Only SOL-quoted launches are supported.");
  if (config.curve !== "virtual_constant_product") reasons.push("Only virtual constant-product curves are supported.");
  if (config.stage !== "curve" && config.stage !== "graduated") throw new Error("Invalid launch stage");
  if (platform !== BigInt(SOLANA_POLICY.tradingFee.platformBps) * BigInt(100)) reasons.push("Platform fee differs from the commercial target.");
  if (creator !== BigInt(SOLANA_POLICY.tradingFee.creatorBps) * BigInt(100)) reasons.push("Creator fee differs from the commercial target.");
  if (total !== BigInt(SOLANA_POLICY.tradingFee.totalBps) * BigInt(100)) reasons.push("Protocol-inclusive trading fee differs from the approved 1.75% curve total.");
  if (creatorClaim !== BigInt(SOLANA_POLICY.creatorClaimFeeBps) * BigInt(100)) reasons.push("An additional creator-claim fee is not approved.");
  if (config.stage === "graduated") reasons.push("The target post-graduation allocation is not verified; curve fees do not establish CPMM or Fee Key distributions.");
  return { compatible: reasons.length === 0, reasons, totalFeeRate: total.toString(), denominator: RATE_DENOMINATOR.toString() };
}

export type LaunchQuoteBinding = {
  cluster: string; mint: string; creator: string; platform: string; config: string;
};
const bindingFields = ["cluster", "mint", "creator", "platform", "config"] as const;
const costFields = ["launch", "network", "protocol", "accountRent", "initialBuy"] as const;

/** A complete expiring cost preview, never a transaction or an authorization to sign. */
export function validateLaunchCostQuote(input: unknown, expected: LaunchQuoteBinding, now: number) {
  const quote = object(input), binding = object(quote.binding), costs = object(quote.costs);
  if (quote.currency !== "SOL") throw new Error("SOL cost quote required");
  for (const field of bindingFields) {
    if (typeof expected[field] !== "string" || !expected[field].trim() || binding[field] !== expected[field]) {
      throw new Error("Quote launch binding mismatch");
    }
  }
  const observedAt = quote.observedAt, expiresAt = quote.expiresAt;
  if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(observedAt) ||
    (observedAt as number) < 0 || !Number.isSafeInteger(expiresAt) || (expiresAt as number) < 0) {
    throw new Error("Valid quote timestamps required");
  }
  const observed = observedAt as number, expires = expiresAt as number;
  if (observed > now || expires <= now || expires <= observed ||
    expires - observed > MAX_QUOTE_AGE_MS || now - observed > MAX_QUOTE_AGE_MS) {
    throw new Error("Fresh unexpired launch quote required");
  }
  if (Object.keys(costs).some(field => !(costFields as readonly string[]).includes(field))) {
    throw new Error("Unknown launch cost component");
  }
  const amounts = Object.fromEntries(costFields.map(field => {
    if (typeof costs[field] !== "string") throw new Error("Complete launch cost breakdown required");
    return [field, lamports(costs[field] as string)];
  })) as Record<typeof costFields[number], bigint>;
  if (amounts.launch !== lamports(SOLANA_POLICY.launchFeeLamports)) throw new Error("Unapproved platform launch charge");
  if (typeof quote.totalLamports !== "string") throw new Error("Complete launch total required");
  const total = costFields.reduce((sum, field) => sum + amounts[field], BigInt(0));
  if (lamports(quote.totalLamports) !== total) throw new Error("Launch cost total mismatch");
  return { totalLamports: total.toString(), expiresAt: expires, costs: Object.fromEntries(costFields.map(field => [field, amounts[field].toString()])) };
}

/** Local review foundation only; metadata validation alone cannot produce a payable quote. */
export function reviewLaunchIntent(metadata: Record<string, unknown>, config: unknown, quote: unknown, expected: LaunchQuoteBinding, now: number) {
  return {
    metadata: validateTokenMetadata(metadata),
    configuration: reviewLaunchConfiguration(config),
    quote: validateLaunchCostQuote(quote, expected, now),
    launchEnabled: false as const,
    requiresOnChainVerification: true as const,
    requiresTransactionSimulation: true as const,
  };
}
