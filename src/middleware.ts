import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/lib/admin-cookie";

const PRODUCTION_ORIGIN = "https://garmonpay.com";

/** Admin routes: redirect to login if no admin session cookie (server-set httpOnly). Layout also verifies. */
function hasAdminCookie(request: NextRequest): boolean {
  return !!request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Admin: protect dashboard routes; allow /admin and /admin/login without cookie
  if (pathname.startsWith("/admin")) {
    if (pathname === "/admin" || pathname === "/admin/login") {
      return NextResponse.next();
    }
    if (!hasAdminCookie(request)) {
      const loginUrl = new URL("/admin/login", request.url);
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
