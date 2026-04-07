/**
 * Lightweight signup compliance: age 18+ and allowed US state.
 * IRS $600 / 1099-style flows can use reportable_earnings_cents on profiles separately.
 */

/** Gross reportable payouts at or above this (USD cents) typically trigger tax info collection in the US. */
export const IRS_REPORTABLE_PAYOUT_THRESHOLD_CENTS = 60_000;

const DOB_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Latest calendar date of birth that is still under 18 today (exclusive max for `<input type="date" max="…">`). */
export function maxDateOfBirthForMinimumAge(minAgeYears: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - minAgeYears);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** True if the person has reached `minAgeYears` by today (UTC calendar comparison). */
export function isAtLeastAge(dobIso: string, minAgeYears: number): boolean {
  if (!DOB_RE.test(dobIso.trim())) return false;
  const [ys, ms, ds] = dobIso.trim().split("-").map(Number);
  if (!ys || !ms || !ds) return false;
  const birth = new Date(Date.UTC(ys, ms - 1, ds));
  if (Number.isNaN(birth.getTime())) return false;
  const today = new Date();
  const utcY = today.getUTCFullYear();
  const utcM = today.getUTCMonth();
  const utcD = today.getUTCDate();
  let age = utcY - birth.getUTCFullYear();
  const birthM = birth.getUTCMonth();
  const birthD = birth.getUTCDate();
  if (utcM < birthM || (utcM === birthM && utcD < birthD)) age -= 1;
  return age >= minAgeYears;
}
