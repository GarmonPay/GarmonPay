export const PAPER_SYMBOLS = ["BTC", "ETH"] as const;
export type PaperSymbol = (typeof PAPER_SYMBOLS)[number];

export function applyPaperFill(input: {
  cashLamports: bigint;
  position: { microUnits: bigint; costLamports: bigint } | null;
  side: "buy" | "sell";
  spendLamports?: bigint;
  sellMicroUnits?: bigint;
  tokenMicrousd: bigint;
  solMicrousd: bigint;
}) {
  if (input.tokenMicrousd <= BigInt("0") || input.solMicrousd <= BigInt("0")) throw new Error("A live price is required. No fill was recorded.");
  if (input.side === "buy") {
    const spend = input.spendLamports ?? BigInt("0");
    if (spend <= BigInt("0") || spend > input.cashLamports) throw new Error("That virtual SOL amount is not available.");
    const microUnits = (spend * input.solMicrousd) / (BigInt("1000") * input.tokenMicrousd);
    if (microUnits <= BigInt("0")) throw new Error("That amount is too small at the current price.");
    const next = input.position ?? { microUnits: BigInt("0"), costLamports: BigInt("0") };
    return {
      cashLamports: input.cashLamports - spend,
      position: { microUnits: next.microUnits + microUnits, costLamports: next.costLamports + spend },
      microUnits,
      virtualLamports: spend,
      realizedLamports: BigInt("0"),
    };
  }
  const sell = input.sellMicroUnits ?? BigInt("0");
  if (!input.position || sell <= BigInt("0") || sell > input.position.microUnits) throw new Error("That paper position is not available.");
  const proceeds = (sell * input.tokenMicrousd * BigInt("1000")) / input.solMicrousd;
  if (proceeds <= BigInt("0")) throw new Error("That amount is too small at the current price.");
  const cost = (input.position.costLamports * sell) / input.position.microUnits;
  const remaining = input.position.microUnits - sell;
  return {
    cashLamports: input.cashLamports + proceeds,
    position: remaining === BigInt("0") ? null : { microUnits: remaining, costLamports: input.position.costLamports - cost },
    microUnits: sell,
    virtualLamports: proceeds,
    realizedLamports: proceeds - cost,
  };
}

export function microUnitsToDisplay(microUnits: bigint): string {
  const whole = microUnits / BigInt("1000000");
  const fraction = (microUnits % BigInt("1000000")).toString().padStart(6, "0").replace(/0+$/, "");
  return `${whole.toString()}${fraction ? `.${fraction}` : ""}`;
}

export function displayToMicroUnits(raw: string): bigint | null {
  const text = raw.trim();
  if (!/^\d{1,9}(\.\d{1,6})?$/.test(text)) return null;
  const [whole, frac = ""] = text.split(".");
  const units = BigInt(whole) * BigInt("1000000") + BigInt(frac.padEnd(6, "0"));
  return units > BigInt("0") ? units : null;
}

export const PAPER_DISCLOSURE = "Paper fills use virtual SOL. They are not real assets, wallet balances, or Mainnet trades, and they cannot be withdrawn.";
