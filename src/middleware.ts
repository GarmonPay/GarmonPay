import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/lib/admin-cookie";
import { getClientIp, checkRateLimit } from "@/lib/rate-limit";

const PRODUCTION_ORIGIN = "https://garmonpay.com";
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 1000;

/** Admin routes: redirect to login if no admin session cookie (server-set httpOnly). Layout also verifies. */
function hasAdminCookie(request: NextRequest): boolean {
  return !!request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
}

/** Paths and methods that are rate limited (10/min per IP). */
function isRateLimitedPath(pathname: string, method: string): string | null {
  if (pathname.startsWith("/api/admin")) return "admin";
  if (pathname === "/api/withdrawals") return "withdraw";
  if (pathname === "/api/wallet/fund" && method === "POST") return "wallet-fund";
  if (pathname === "/api/create-checkout-session" && method === "POST") return "checkout";
  if (pathname === "/api/stripe/add-funds" && method === "POST") return "add-funds";
  return null;
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const method = request.method;

  // IP-based rate limiting for sensitive API routes
  const rateKey = isRateLimitedPath(pathname, method);
  if (rateKey) {
    const ip = getClientIp(request);
    const result = checkRateLimit(ip, rateKey, RATE_LIMIT, RATE_WINDOW_MS);
    if (!result.allowed) {
      const retryAfter = String(result.retryAfterSec);
      return new NextResponse(
        JSON.stringify({ message: "Too Many Requests", retryAfter: result.retryAfterSec }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": retryAfter,
            "X-RateLimit-Limit": String(RATE_LIMIT),
            "X-RateLimit-Remaining": "0",
          },
        }
      );
    }
  }

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
