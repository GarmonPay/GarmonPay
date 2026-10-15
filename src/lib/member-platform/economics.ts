/** Server-authoritative member economics. Versioned so a quote can be audited. Not a live payout. */
export const ECONOMICS_VERSION = "2026-10-14-member-v2";
export const ADVERTISER_FIRST_PURCHASE_BPS = 2000;
export const ADVERTISER_SUBSEQUENT_PURCHASE_BPS = 1000;
export const VIEWER_MATCH_BPS = 10000;
export const PACKAGE_VIEWS = 500;
export const PAPER_STARTING_LAMPORTS = BigInt("10000000000");
export const LAMPORTS_PER_SOL = BigInt("1000000000");
export const PAYMENT_ENABLED = false;
export const PAYOUTS_ENABLED = false;

export function advertiserRateBps(priorQualifyingPurchases: number) {
  if (!Number.isInteger(priorQualifyingPurchases) || priorQualifyingPurchases < 0) {
    throw new Error("Prior qualifying purchases must be a non-negative integer.");
  }
  return priorQualifyingPurchases === 0 ? ADVERTISER_FIRST_PURCHASE_BPS : ADVERTISER_SUBSEQUENT_PURCHASE_BPS;
}

export function advertiserCommission(grossLamports: bigint, priorQualifyingPurchases: number): bigint {
  if (grossLamports <= BigInt("0")) throw new Error("A qualifying purchase must be a positive lamport amount.");
  return (grossLamports * BigInt(advertiserRateBps(priorQualifyingPurchases))) / BigInt("10000");
}

/** Separately reserved match. The viewer keeps the full eligible earning. */
export function viewerMatch(earningLamports: bigint): { viewerLamports: bigint; matchLamports: bigint } {
  if (earningLamports < BigInt("0")) throw new Error("Viewer earnings cannot be negative.");
  return {
    viewerLamports: earningLamports,
    matchLamports: (earningLamports * BigInt(VIEWER_MATCH_BPS)) / BigInt("10000"),
  };
}

export function parseSolToLamports(raw: string, allowZero = false): bigint | null {
  const text = raw.trim();
  if (!/^\d{1,9}(\.\d{1,9})?$/.test(text)) return null;
  const [whole, frac = ""] = text.split(".");
  const lamports = BigInt(whole) * LAMPORTS_PER_SOL + BigInt(frac.padEnd(9, "0"));
  if (lamports === BigInt("0")) return allowZero ? BigInt("0") : null;
  return lamports;
}

export function formatLamports(value: string | bigint): string {
  const lamports = typeof value === "bigint" ? value : BigInt(value);
  const negative = lamports < BigInt("0");
  const absolute = negative ? -lamports : lamports;
  const whole = absolute / LAMPORTS_PER_SOL;
  const fraction = (absolute % LAMPORTS_PER_SOL).toString().padStart(9, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole.toString()}${fraction ? `.${fraction}` : ""}`;
}

export function assertNotFinancialSettlement(action: { pays: boolean; charges: boolean; broadcasts: boolean }) {
  if (action.pays || action.charges || action.broadcasts || PAYMENT_ENABLED || PAYOUTS_ENABLED) {
    throw new Error("Financial settlement is paused. Nothing was charged, paid, or broadcast.");
  }
}
