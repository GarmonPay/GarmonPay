import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PRODUCTION_ORIGIN = "https://garmonpay.com";

/** Check if request has a Supabase auth cookie (session). */
function hasAuthCookie(request: NextRequest): boolean {
  const token = request.cookies.get("sb-admin-token")?.value
    ?? request.cookies.get("sb-access-token")?.value;
  return !!token;
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Guard admin pages early to avoid loading dashboard shell without a session cookie.
  if (pathname.startsWith("/admin")) {
    if (pathname !== "/admin/login" && !hasAuthCookie(request)) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/admin/login";
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

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
