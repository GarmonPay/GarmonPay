import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { getStripe, isStripeConfigured, getCheckoutBaseUrl } from "@/lib/stripe-server";
import { createAdminClient } from "@/lib/supabase";

/**
 * POST /api/coins/checkout
 * Body: { packageId: string } — Stripe Checkout for a GC package.
 */
export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 503 });
  }

  const userId = await getAuthUserIdStrict(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { packageId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const packageId = typeof body.packageId === "string" ? body.packageId : null;
  if (!packageId) {
    return NextResponse.json({ error: "packageId required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const { data: pkg, error: pkgErr } = await supabase
    .from("gc_packages")
    .select("id, name, price_cents, gold_coins, bonus_sweeps_coins, is_active")
    .eq("id", packageId)
    .maybeSingle();

  if (pkgErr || !pkg || !(pkg as { is_active?: boolean }).is_active) {
    return NextResponse.json({ error: "Package not found" }, { status: 404 });
  }

  const p = pkg as { id: string; name: string; price_cents: number; gold_coins: number; bonus_sweeps_coins: number };
  const { data: userRow } = await supabase.from("users").select("email").eq("id", userId).maybeSingle();
  const email = (userRow as { email?: string } | null)?.email;
  if (!email) {
    return NextResponse.json({ error: "User email not found" }, { status: 400 });
  }

  const base = getCheckoutBaseUrl(request);
  const successUrl = `${base}/dashboard/buy-coins?success=1`;
  const cancelUrl = `${base}/dashboard/buy-coins?canceled=1`;

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: email,
      client_reference_id: userId,
      metadata: {
        user_id: userId,
        email,
        product_type: "gc_package",
        gc_package_id: p.id,
        gc_package_name: p.name,
        gold_coins: String(p.gold_coins),
        bonus_sweeps_coins: String(p.bonus_sweeps_coins),
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: p.price_cents,
            product_data: {
              name: `${p.name} — ${p.gold_coins.toLocaleString()} GC + ${p.bonus_sweeps_coins.toLocaleString()} bonus SC`,
            },
          },
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    if (!session.url) {
      return NextResponse.json({ error: "Checkout URL missing" }, { status: 500 });
    }

    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("[coins/checkout]", e);
    return NextResponse.json({ error: "Checkout failed" }, { status: 500 });
  }
}
