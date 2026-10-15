const BUY_PRESETS = [
  { sol: "0.00001", lamports: 10_000 },
  { sol: "0.00005", lamports: 50_000 },
] as const;

/** Small fixed Devnet sell sizes. These are token amounts, not a share of the wallet. */
export const SELL_TEST_AMOUNTS = ["1", "10", "100"] as const;

/** Warn from 1.00%. Block every trade at 5.00% or more. No amount is exempt. */
export const PRICE_IMPACT_POLICY = Object.freeze({
  warnAtBps: 100,
  blockAtBps: 500,
  extremeTradesPermitted: false,
});

export function toRawUnits(text: string, decimals: number) {
  const trimmed = text.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new Error("Enter an amount.");
  const [whole, fraction = ""] = trimmed.split(".");
  if (fraction.length > decimals) throw new Error("That amount has too many decimal places.");
  const raw = (whole + fraction.padEnd(decimals, "0")).replace(/^0+/, "");
  if (!raw) throw new Error("Enter an amount greater than zero.");
  return raw;
}

export function rawToDecimal(raw: string, decimals: number) {
  const padded = raw.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

export function suggestedBuySol(remainingLamports: string) {
  let remaining: bigint;
  try { remaining = BigInt(remainingLamports); }
  catch { return ""; }
  if (remaining >= BigInt(10_000)) return "0.00001";
  return "";
}

export function priceImpactBps(label: string | null | undefined) {
  if (!label) return null;
  const match = /^(-?)(\d+)\.(\d{2})%$/.exec(label);
  if (!match) return null;
  return (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 100 + Number(match[3]));
}

export function priceImpactDecision(label: string | null | undefined) {
  const bps = priceImpactBps(label);
  if (bps === null) return { bps, level: "unknown" as const, blocked: true };
  if (bps >= PRICE_IMPACT_POLICY.blockAtBps && !PRICE_IMPACT_POLICY.extremeTradesPermitted) return { bps, level: "blocked" as const, blocked: true };
  if (bps >= PRICE_IMPACT_POLICY.warnAtBps) return { bps, level: "high" as const, blocked: false };
  return { bps, level: "ok" as const, blocked: false };
}

export function assertPriceImpactAllowed(label: string | null | undefined) {
  const decision = priceImpactDecision(label);
  if (decision.level === "unknown") throw new Error("Price impact could not be calculated. No order was created.");
  if (decision.blocked) throw new Error(`Price impact is ${label}. That is above the 5.00% Devnet limit, so no order was created.`);
}

export function buyAmountChoices(remainingLamports: string, curveLimited = true) {
  let remaining = BigInt(0);
  try { remaining = BigInt(remainingLamports); }
  catch { remaining = BigInt(0); }
  return BUY_PRESETS.map(choice => ({
    sol: choice.sol,
    disabled: curveLimited && BigInt(choice.lamports) > remaining,
    reason: curveLimited && BigInt(choice.lamports) > remaining ? "More than the SOL left on this bonding curve." : "",
  }));
}

export function parseSlippagePercent(text: string): { bps: number } | { error: string } {
  const trimmed = text.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return { error: "Enter a slippage percent from 0.10 to 10." };
  const bps = Math.round(Number(trimmed) * 100);
  if (!Number.isInteger(bps) || bps < 10 || bps > 1000) return { error: "Slippage must be from 0.10% to 10%." };
  return { bps };
}

export function slippageWarning(bps: number) {
  if (bps > 200) return "This tolerance can accept a much worse price. Slippage is separate from the trading fees.";
  return "";
}

export function percentOfRaw(raw: string, percent: number, decimals: number) {
  if (!/^[0-9]+$/.test(raw) || !Number.isInteger(percent) || percent < 1 || percent > 100) return "";
  const amount = (BigInt(raw) * BigInt(percent)) / BigInt(100);
  if (amount <= BigInt(0)) return "";
  return rawToDecimal(amount.toString(), decimals);
}
