import { NextResponse } from "next/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe-server";
import { createAdminClient } from "@/lib/supabase";
import { findUserById, hasAdminAccess } from "@/lib/auth-store";

function isAdmin(request: Request): boolean {
  const adminId = request.headers.get("x-admin-id");
  if (!adminId) return false;
  const user = findUserById(adminId);
  return !!(user && hasAdminAccess(user));
}

/**
 * Create a transfer to a user's Stripe Connect account (payout).
 * Admin only. Body: { userId, amountCents, currency? }
 */
export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ message: "Stripe is not configured" }, { status: 503 });
  }

  if (!isAdmin(request)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  let body: { userId?: string; amountCents?: number; currency?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const userId = typeof body.userId === "string" ? body.userId : null;
  const amountCents = typeof body.amountCents === "number" ? Math.round(body.amountCents) : 0;
  const currency = (typeof body.currency === "string" ? body.currency : "usd").toLowerCase();

  if (!userId || amountCents < 100) {
    return NextResponse.json({ message: "userId and amountCents (min 100) required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Database unavailable" }, { status: 503 });
  }

  const { data: userRow } = await supabase
    .from("users")
    .select("stripe_account_id")
    .eq("id", userId)
    .single();

  const stripeAccountId = (userRow as { stripe_account_id?: string } | null)?.stripe_account_id;
  if (!stripeAccountId) {
    return NextResponse.json({ message: "User has no Stripe Connect account. They must complete onboarding first." }, { status: 400 });
  }

  try {
    const stripe = getStripe();
    const transfer = await stripe.transfers.create({
      amount: amountCents,
      currency,
      destination: stripeAccountId,
      description: "GarmonPay payout",
      metadata: { user_id: userId },
    });
    return NextResponse.json({ transferId: transfer.id, amount: amountCents, currency });
  } catch (err) {
    console.error("Stripe transfer error:", err);
    const message = err instanceof Error ? err.message : "Transfer failed";
    return NextResponse.json({ message }, { status: 500 });
  }
}
