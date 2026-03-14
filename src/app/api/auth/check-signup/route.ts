import { NextResponse } from "next/server";
import { getClientIp, checkRateLimit } from "@/lib/rate-limit";
import { isDisposableEmail } from "@/lib/disposable-email-domains";

const SIGNUP_LIMIT = 5;
const SIGNUP_WINDOW_MS = 60 * 60 * 1000; // 1 hour per IP

/**
 * POST /api/auth/check-signup
 * Pre-signup checks: rate limit (5/hour per IP), Turnstile, disposable email.
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

  let body: { email?: string; turnstileToken?: string };
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

  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (secret) {
    const token = typeof body.turnstileToken === "string" ? body.turnstileToken.trim() : "";
    if (!token) {
      return NextResponse.json(
        { allowed: false, message: "Please complete the security check." },
        { status: 400 }
      );
    }
    try {
      const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, response: token, remoteip: ip }),
      });
      const verifyData = (await verifyRes.json()) as { success?: boolean; "error-codes"?: string[] };
      if (!verifyData.success) {
        return NextResponse.json(
          { allowed: false, message: "Security check failed. Please try again." },
          { status: 400 }
        );
      }
    } catch (e) {
      console.error("Turnstile verify error:", e);
      return NextResponse.json(
        { allowed: false, message: "Security check unavailable. Try again later." },
        { status: 503 }
      );
    }
  }

  return NextResponse.json({ allowed: true });
}
