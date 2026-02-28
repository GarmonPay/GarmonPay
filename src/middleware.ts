import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PRODUCTION_ORIGIN = "https://garmonpay.com";

/** Check if request has a Supabase auth cookie (session). */
function hasAuthCookie(request: NextRequest): boolean {
  const token = request.cookies.get("sb-access-token")?.value;
  if (token) return true;
  const all = request.cookies.getAll();
  const hasSupabaseAuth = all.some(
    (c) => c.name.startsWith("sb-") && c.name.includes("auth") && c.value
  );
  return !!hasSupabaseAuth;
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Allow all /admin routes through; server layout handles auth and redirect to /admin/login
  if (pathname.startsWith("/admin")) {
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
