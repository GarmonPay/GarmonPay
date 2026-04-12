import { NextResponse } from "next/server";
import { getClientIp, checkRateLimit } from "@/lib/rate-limit";
import { isDisposableEmail } from "@/lib/disposable-email-domains";

const SIGNUP_LIMIT = 5;
const SIGNUP_WINDOW_MS = 60 * 60 * 1000; // 1 hour per IP

/**
 * POST /api/auth/check-signup
 * Pre-signup checks: rate limit (5/hour per IP), disposable email.
 * Returns { allowed: boolean, message?: string }.
 * Client must call this before supabase.auth.signUp().
 */
export async function POST(req: Request) {
  const ip = getClientIp(req);
  const result = checkRateLimit(ip, "signup", SIGNUP_LIMIT, SIGNUP_WINDOW_MS);
  if (!result.allowed) {
    return NextResponse.json(
      { allowed: false, message: "Too many signup attempts from this network. Try again later." },
      { status: 429, headers: { "Retry-After": String(result.retryAfterSec) } }
    );
  }

  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ allowed: false, message: "Invalid request" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email) {
    return NextResponse.json({ allowed: false, message: "Email is required" }, { status: 400 });
  }

  if (isDisposableEmail(email)) {
    return NextResponse.json(
      { allowed: false, message: "Disposable email addresses are not allowed." },
      { status: 400 }
    );
  }

  return NextResponse.json({ allowed: true });
}
