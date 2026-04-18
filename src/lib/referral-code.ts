import { createHash } from "crypto";

/** Deterministic code matching SQL: 'GARM-' || upper(substring(md5(id::text), 1, 6)) */
export function referralCodeFromUserId(userId: string): string {
  const hex = createHash("md5").update(userId).digest("hex").slice(0, 6).toUpperCase();
  return `GARM-${hex}`;
}
