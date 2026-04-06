/**
 * Canonical wallet display: public.profiles.balance / balance_cents (stored as cents).
 * Prefer balance_cents when present; otherwise profiles.balance (numeric cents).
 */

export type ProfileBalanceRow = {
  balance?: unknown;
  balance_cents?: unknown;
};

export type ResolvedProfileBalance =
  | { ok: true; cents: number }
  | { ok: false; message: string };

export function resolveProfileBalanceCents(row: ProfileBalanceRow | null): ResolvedProfileBalance {
  if (!row) {
    return { ok: false, message: "Profile not found" };
  }
  const rawCents = row.balance_cents;
  if (rawCents != null && rawCents !== "") {
    const n = Number(rawCents);
    if (Number.isFinite(n)) {
      return { ok: true, cents: Math.round(n) };
    }
  }
  const rawBal = row.balance;
  if (rawBal != null && rawBal !== "") {
    const n = Number(rawBal);
    if (Number.isFinite(n)) {
      return { ok: true, cents: Math.round(n) };
    }
  }
  return { ok: false, message: "Profile has no readable balance" };
}
