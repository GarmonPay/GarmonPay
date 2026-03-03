import { NextResponse } from "next/server";

/**
 * GET /api/stripe/status — Check if Stripe secret key is set (format only).
 * Does not call Stripe API, so a valid key won't show "Stripe key issue" in the modal.
 */
export async function GET() {
  let secret = process.env.STRIPE_SECRET_KEY;
  if (secret) secret = secret.trim().replace(/^["']|["']$/g, "").replace(/\s/g, "");
  if (!secret?.startsWith("sk_")) {
    return NextResponse.json({
      ok: false,
      configured: false,
      message: secret?.startsWith("pk_")
        ? "Use Stripe secret key (sk_...), not publishable key (pk_...)."
        : "Set STRIPE_SECRET_KEY in .env.local and restart the server.",
    });
  }
  return NextResponse.json({ ok: true, configured: true });
}
