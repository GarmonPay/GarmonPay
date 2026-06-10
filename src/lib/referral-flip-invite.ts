export const REFERRAL_FLIP_GAME_STORAGE_KEY = "garmonpay_coin_flip_invite_game";
export const REFERRAL_FLIP_REF_STORAGE_KEY = "garmonpay_coin_flip_invite_ref";
export const POST_AUTH_REDIRECT_KEY = "garmonpay_post_auth_redirect";
export const REFERRAL_COOKIE = "garmonpay_ref";
export const REFERRAL_COOKIE_MAX_AGE_DAYS = 14;

export function setReferralCookie(code: string): void {
  if (typeof document === "undefined") return;
  const value = encodeURIComponent(code.trim());
  document.cookie = `${REFERRAL_COOKIE}=${value}; path=/; max-age=${REFERRAL_COOKIE_MAX_AGE_DAYS * 24 * 60 * 60}; SameSite=Lax`;
}

export function persistReferralFlipInvite(gameId: string, ref?: string): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(REFERRAL_FLIP_GAME_STORAGE_KEY, gameId.trim());
  if (ref?.trim()) {
    sessionStorage.setItem(REFERRAL_FLIP_REF_STORAGE_KEY, ref.trim());
  }
}

export function inviteFlipPath(gameId: string, ref?: string): string {
  const id = gameId.trim();
  const q = ref?.trim() ? `?ref=${encodeURIComponent(ref.trim())}` : "";
  return `/invite/flip/${encodeURIComponent(id)}${q}`;
}

/** Post-signup / post-confirm destination when a referral flip invite is pending. */
export function getReferralFlipRedirectPath(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const stored = sessionStorage.getItem(POST_AUTH_REDIRECT_KEY);
    if (stored && stored.startsWith("/") && !stored.startsWith("//")) {
      sessionStorage.removeItem(POST_AUTH_REDIRECT_KEY);
      return stored;
    }
    const gameId = sessionStorage.getItem(REFERRAL_FLIP_GAME_STORAGE_KEY)?.trim();
    if (!gameId) return null;
    const ref = sessionStorage.getItem(REFERRAL_FLIP_REF_STORAGE_KEY)?.trim();
    return inviteFlipPath(gameId, ref || undefined);
  } catch {
    return null;
  }
}
