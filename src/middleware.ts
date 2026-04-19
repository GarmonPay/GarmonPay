import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE } from "@/lib/admin-cookie";
import { getClientIp, checkRateLimit } from "@/lib/rate-limit";

const PRODUCTION_ORIGIN = "https://garmonpay.com";
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 1000;

/**
 * Safe canonical site origin for redirects. Malformed NEXT_PUBLIC_SITE_URL must never throw —
 * otherwise middleware crashes and every page returns 500.
 */
function resolveSiteOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return PRODUCTION_ORIGIN;
  try {
    const normalized = raw.includes("://") ? raw : `https://${raw}`;
    const u = new URL(normalized);
    if (u.protocol !== "http:" && u.protocol !== "https:") return PRODUCTION_ORIGIN;
    return u.origin;
  } catch {
    return PRODUCTION_ORIGIN;
  }
}

/**
 * Skip production HTTPS/canonical redirect for local dev (loopback, typical LAN test IPs, or explicit opt-out).
 * Prevents 301 → garmonpay.com when NODE_ENV=production on a laptop or phone-on-Wi‑Fi.
 */
function skipCanonicalRedirect(hostHeader: string): boolean {
  if (process.env.SKIP_CANONICAL_REDIRECT === "1") return true;
  const raw = hostHeader.trim().toLowerCase();
  if (!raw) return false;
  if (raw.startsWith("[")) {
    return raw.startsWith("[::1]") || raw.startsWith("[0:0:0:0:0:0:0:1]");
  }
  const host = raw.split(":")[0] ?? "";
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "0.0.0.0") {
    return true;
  }
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  return false;
}

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

  // Public marketing/auth routes (e.g. /register, /login) are not gated here—no session required.

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

  if (skipCanonicalRedirect(host)) {
    return NextResponse.next();
  }

  const siteOrigin = resolveSiteOrigin();
  let canonicalHost: string;
  try {
    canonicalHost = new URL(siteOrigin).host;
  } catch {
    canonicalHost = new URL(PRODUCTION_ORIGIN).host;
  }

  const needHttps = proto !== "https";
  const needCanonicalHost = host && host !== canonicalHost;

  if (needHttps || needCanonicalHost) {
    try {
      const redirectUrl = new URL(url.pathname + url.search, siteOrigin);
      redirectUrl.protocol = "https:";
      return NextResponse.redirect(redirectUrl, 301);
    } catch {
      return NextResponse.next();
    }
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
