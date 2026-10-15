const LEGACY_CODE = /^[0-9a-f]{32}$/;
const SHORT_CODE = /^[abcdefghjkmnpqrstuvwxyz23456789]{8}$/;

/** Accept the original 32-character code and the public 8-character invite code. */
export function referralToken(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const token = value.trim();
  if (LEGACY_CODE.test(token) || SHORT_CODE.test(token)) return token;
  return null;
}
