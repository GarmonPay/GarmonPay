import { NextResponse } from "next/server";

/**
 * GET /api/stripe/debug — Verify the server sees STRIPE_SECRET_KEY (does not expose the key).
 * Use this to confirm .env.local is loaded after restart.
 */
export async function GET() {
  const raw = process.env.STRIPE_SECRET_KEY ?? "";
  const trimmed = raw.trim().replace(/^["']|["']$/g, "");
  const keyPresent = trimmed.length > 0;
  const prefix = trimmed.startsWith("sk_live_")
    ? "sk_live_"
    : trimmed.startsWith("sk_test_")
      ? "sk_test_"
      : trimmed.startsWith("sk_")
        ? "sk_"
        : null;
  return NextResponse.json({
    keyPresent,
    prefix,
    keyLength: trimmed.length,
    hint: !keyPresent
      ? "STRIPE_SECRET_KEY is not set. Add it to .env.local and restart (npm run dev)."
      : !prefix
        ? "Key should start with sk_live_ or sk_test_. Check .env.local."
        : "Key is present. If deposit still fails, the key may be expired — get a new one from Stripe Dashboard.",
  });
}
