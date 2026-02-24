/**
 * Production site URL. Use everywhere for referral links, auth redirects, and canonical URLs.
 * Set NEXT_PUBLIC_SITE_URL in production (e.g. https://garmonpay.com).
 */

const PRODUCTION_URL = "https://garmonpay.com";

export function getSiteUrl(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL ?? PRODUCTION_URL;
  return typeof url === "string" && url ? url.replace(/\/$/, "") : PRODUCTION_URL;
}

/** Base URL for referral signup links: {siteUrl}/register?ref=CODE */
export function getReferralLink(referralCode: string): string {
  return `${getSiteUrl()}/register?ref=${referralCode || ""}`;
}

/** Base URL for auth redirects: {siteUrl}/dashboard etc. */
export function getDashboardUrl(): string {
  return `${getSiteUrl()}/dashboard`;
}

export function getRegisterUrl(): string {
  return `${getSiteUrl()}/register`;
}

export function getLoginUrl(): string {
  return `${getSiteUrl()}/login`;
}
