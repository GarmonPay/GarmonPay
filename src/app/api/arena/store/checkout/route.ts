import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { getStripe, isStripeConfigured, getCheckoutBaseUrl } from "@/lib/stripe-server";

/** POST /api/arena/store/checkout — create Stripe Checkout session for a store item (real money). */
export async function POST(req: Request) {
  const userId = await getAuthUserIdStrict(req);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (!isStripeConfigured()) {
    return NextResponse.json({ message: "Stripe is not configured" }, { status: 503 });
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  let body: { storeItemId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }
  const storeItemId = body.storeItemId;
  if (!storeItemId || typeof storeItemId !== "string") {
    return NextResponse.json({ message: "storeItemId required" }, { status: 400 });
  }

  const { data: item, error: itemErr } = await supabase
    .from("arena_store_items")
    .select("id, category, name, description, price, effect_class")
    .eq("id", storeItemId)
    .eq("is_active", true)
    .maybeSingle();
  if (itemErr || !item) {
    return NextResponse.json({ message: "Item not found" }, { status: 404 });
  }
  const price = Number((item as { price?: number }).price);
  if (!(price > 0)) {
    return NextResponse.json({ message: "Item is not available for purchase with real money" }, { status: 400 });
  }

  const { data: fighter, error: fErr } = await supabase
    .from("arena_fighters")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (fErr || !fighter) {
    return NextResponse.json({ message: "Fighter not found" }, { status: 404 });
  }

  const amountCents = Math.round(price * 100);
  const base = getCheckoutBaseUrl(req);
  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: undefined,
      client_reference_id: userId,
      metadata: {
        user_id: userId,
        product_type: "arena_store",
        store_item_id: storeItemId,
        fighter_id: (fighter as { id: string }).id,
      },
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Arena: ${(item as { name?: string }).name}`,
              description: (item as { description?: string }).description ?? (item as { category?: string }).category,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      success_url: `${base}/dashboard/arena/store?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/dashboard/arena/store`,
    });
    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create checkout session";
    return NextResponse.json({ message }, { status: 500 });
  }
}
