const LEGACY_CODE = /^[0-9a-f]{32}$/;
const SHORT_CODE = /^[abcdefghjkmnpqrstuvwxyz23456789]{8}$/;

/** Legacy email invites stay on /r/[code] and redirect to /register. */
export const LEGACY_REFERRAL_COOKIE = "garmonpay_ref";
export const LEGACY_REFERRAL_REDIRECT = "/register";

/** Wallet-member invites use /join/[code] and never set the legacy cookie. */
export function referralToken(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const token = value.trim();
  if (LEGACY_CODE.test(token) || SHORT_CODE.test(token)) return token;
  return null;
}

export function joinPath(code: string): string | null {
  const token = referralToken(code);
  if (!token || LEGACY_CODE.test(token)) return null;
  return `/join/${token}`;
}
