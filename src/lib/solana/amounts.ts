export const LAMPORTS_PER_SOL = BigInt(1_000_000_000);
const MAX = BigInt("9223372036854775807");
export function lamports(value: string): bigint {
  if (!/^(0|[1-9][0-9]{0,18})$/.test(value)) throw new Error("Invalid lamport amount");
  const amount = BigInt(value);
  if (amount > MAX) throw new Error("Amount exceeds accounting limit");
  return amount;
}
export function solToLamports(value: string): bigint {
  if (!/^(0|[1-9][0-9]*)(\.[0-9]{1,9})?$/.test(value)) throw new Error("Use at most nine SOL decimals");
  const [whole, fractional = ""] = value.split(".");
  return lamports((BigInt(whole) * LAMPORTS_PER_SOL + BigInt(fractional.padEnd(9, "0"))).toString());
}
export function formatSol(amount: bigint): string {
  if (amount < BigInt(0)) throw new Error("Negative amount");
  const fraction = (amount % LAMPORTS_PER_SOL).toString().padStart(9, "0").replace(/0+$/, "");
  return `${amount / LAMPORTS_PER_SOL}${fraction ? `.${fraction}` : ""}`;
}
export function withdrawalQuote(gross: bigint, minimum: bigint, feeBps: number, cap: bigint) {
  if (gross <= BigInt(0) || minimum < BigInt(0) || gross < minimum || cap < BigInt(0) || !Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10000) throw new Error("Invalid withdrawal quote");
  const proportional = gross * BigInt(feeBps) / BigInt(10000);
  const fee = proportional < cap ? proportional : cap;
  return { gross, fee, net: gross - fee };
}
/** Approved percentages only. Rounding remainder stays in the designated reward reserve. */
export function allocateLamports(total: bigint, bps: Record<string, number>, reserve: string) {
  if (total < BigInt(0) || !(reserve in bps) || Object.values(bps).some(v => !Number.isInteger(v) || v < 0) || Object.values(bps).reduce((a,b) => a+b,0) !== 10000) throw new Error("A complete approved allocation is required");
  const result = Object.fromEntries(Object.entries(bps).map(([key, rate]) => [key, total * BigInt(rate) / BigInt(10000)]));
  result[reserve] += total - Object.values(result).reduce((a,b) => a+b,BigInt(0));
  return result;
}
/** USD micro-units / SOL price in USD micro-units. Floor rewards; ceil minimums. */
export function usdToLamports(usdMicros: bigint, priceMicros: bigint, observedAt: number, now: number, roundUp = false) {
  if (usdMicros < BigInt(0) || priceMicros <= BigInt(0) || !Number.isFinite(now) || !Number.isFinite(observedAt) || observedAt > now || now - observedAt > 60000) throw new Error("Fresh verified SOL price required");
  const numerator = usdMicros * LAMPORTS_PER_SOL;
  return roundUp ? (numerator + priceMicros - BigInt(1)) / priceMicros : numerator / priceMicros;
}
