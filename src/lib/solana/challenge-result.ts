import { json } from "./http";

/** Map the database exception to a distinct response. Rate limits stay 429; storage failures stay 503. */
export function challengeDenied(error: { message?: string } | null) {
  const text = error?.message ?? "";
  const limited = /Authentication (IP )?rate limit/.test(text);
  const banned = text.includes("Wallet unavailable");
  const code = limited ? "RATE_LIMIT" : banned ? "WALLET_UNAVAILABLE" : "AUTH_STORE";
  const status = limited ? 429 : banned ? 403 : 503;
  const message = limited
    ? "Too many sign-in attempts. Wait a minute, then try once."
    : banned
      ? "This wallet cannot sign in."
      : "Sign-in is temporarily unavailable. Your account is unchanged.";
  console.info("[garmonpay-auth]", "challenge-denied", { code });
  const response = json({ error: message, code }, status);
  if (limited) response.headers.set("Retry-After", "60");
  return response;
}
