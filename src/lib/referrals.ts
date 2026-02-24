/**
 * Referral link generation. Uses authenticated user ID for ref param.
 * Set NEXT_PUBLIC_SITE_URL in production (e.g. https://garmonpay.com).
 */

export function generateReferralLink(userId: string): string {
  if (!userId) return "";
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://garmonpay.com";
  const url = base.replace(/\/$/, "");
  return `${url}/register?ref=${userId}`;
}
