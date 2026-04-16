/**
 * Safe integer formatting for UI — avoids calling Number.prototype methods on undefined/null.
 */

export function safeFiniteInt(n: unknown): number {
  const x = Math.floor(Number(n ?? 0));
  return Number.isFinite(x) ? Math.max(0, x) : 0;
}

/** Formats a non-negative integer for display (balances, counts, GPC amounts). */
export function localeInt(n: unknown): string {
  return safeFiniteInt(n).toLocaleString();
}

/** USD cents → $x.xx */
export function formatUsdCents(cents: unknown): string {
  const c = Number(cents ?? 0);
  const v = Number.isFinite(c) ? c : 0;
  return `$${(v / 100).toFixed(2)}`;
}
