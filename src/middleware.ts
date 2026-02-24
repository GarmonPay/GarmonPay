import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PRODUCTION_ORIGIN = "https://garmonpay.com";

/**
 * Force HTTPS and production domain in production.
 * - HTTP → HTTPS redirect (via x-forwarded-proto on Vercel)
 * - Non-canonical host → https://garmonpay.com
 */
export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const proto = request.headers.get("x-forwarded-proto");
  const host = request.headers.get("host") ?? "";

  const isProduction =
    process.env.VERCEL_ENV === "production" ||
    process.env.NODE_ENV === "production";

  if (!isProduction) {
    return NextResponse.next();
  }

  const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL ?? PRODUCTION_ORIGIN;
  const canonicalHost = new URL(siteOrigin).host;

  const needHttps = proto !== "https";
  const needCanonicalHost = host && host !== canonicalHost;

  if (needHttps || needCanonicalHost) {
    const redirectUrl = new URL(url.pathname + url.search, siteOrigin);
    redirectUrl.protocol = "https:";
    return NextResponse.redirect(redirectUrl, 301);
  }

  const response = NextResponse.next();

  // HSTS: tell browsers to always use HTTPS for this domain
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains; preload"
  );

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
