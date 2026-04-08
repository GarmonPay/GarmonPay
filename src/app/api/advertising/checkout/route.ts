import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { getStripe, isStripeConfigured, getCheckoutBaseUrl } from "@/lib/stripe-server";
import { createAdminClient } from "@/lib/supabase";

type CheckoutBody = {
  package_id?: string;
  package_name?: string;
  price_monthly?: number | string;
  ad_views?: number | string;
};

export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ message: "Stripe is not configured" }, { status: 503 });
  }

  const userId = await getAuthUserIdStrict(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: CheckoutBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const packageId = typeof body.package_id === "string" ? body.package_id.trim() : "";
  if (!packageId) {
    return NextResponse.json({ message: "package_id is required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Service unavailable" }, { status: 503 });
  }

  const { data: pkg, error: pkgError } = await supabase
    .from("ad_packages")
    .select("id, name, price_monthly, ad_views, is_active")
    .eq("id", packageId)
    .eq("is_active", true)
    .maybeSingle();

  if (pkgError) {
    console.error("[api/advertising/checkout] package lookup error", pkgError);
    return NextResponse.json({ message: "Failed to load package" }, { status: 500 });
  }

  if (!pkg) {
    return NextResponse.json({ message: "Package not found or inactive" }, { status: 404 });
  }

  const packageName = String(pkg.name ?? "").trim();
  const priceMonthly = Number(pkg.price_monthly);
  const adViews = Number(pkg.ad_views);

  if (!packageName || !Number.isFinite(priceMonthly) || priceMonthly <= 0 || !Number.isFinite(adViews) || adViews <= 0) {
    return NextResponse.json({ message: "Package has invalid pricing configuration" }, { status: 400 });
  }

  const amountCents = Math.round(priceMonthly * 100);
  if (amountCents < 50) {
    return NextResponse.json({ message: "Package amount is below Stripe minimum" }, { status: 400 });
  }

  const { data: userRow } = await supabase.from("users").select("email").eq("id", userId).maybeSingle();
  const email = (userRow as { email?: string } | null)?.email ?? "";

  const baseUrl = getCheckoutBaseUrl(request);
  const successUrl = `${baseUrl}/advertise/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${baseUrl}/advertise?canceled=1`;

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: email || undefined,
      client_reference_id: userId,
      metadata: {
        purchase_type: "ad_package",
        user_id: userId,
        package_id: pkg.id,
        package_name: packageName,
        ad_views: String(adViews),
      },
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Ad Package: ${packageName}`,
              description: `${adViews.toLocaleString()} ad views included`,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (e) {
    console.error("[api/advertising/checkout] stripe error", e);
    const message = e instanceof Error ? e.message : "Failed to create checkout session";
    return NextResponse.json({ message }, { status: 500 });
  }
}
