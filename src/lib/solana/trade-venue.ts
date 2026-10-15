export type TradeVenue = "curve" | "cpmm" | "paused" | "unavailable";

export function graduationFacts(status: number, cpmmPool: string | null) {
  const label = status === 0 ? "Bonding curve" : status === 1 ? "Migrating" : status === 2 ? "Graduated" : "Unknown";
  const migration = status === 2 && cpmmPool
    ? "Complete. The Devnet CPMM pool account exists."
    : status === 1
      ? "Pending. Raydium’s migrate wallet has not created the CPMM pool. Trading stays paused."
      : status === 2
        ? "LaunchLab status is Graduated, and no Devnet CPMM pool account was found."
        : "Not started. The coin is still on the bonding curve.";
  return { code: status, label, migration };
}

/** Status 0 always stays on the bonding curve, even if a CPMM account is also present. */
export function tradeVenue(status: number, cpmmReady: boolean): TradeVenue {
  if (status === 0) return "curve";
  if (status === 1) return "paused";
  if (status === 2 && cpmmReady) return "cpmm";
  return "unavailable";
}
