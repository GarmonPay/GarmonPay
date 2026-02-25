import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { getStripe, isStripeConfigured, type StripeProductType } from "@/lib/stripe-server";
import { createAdminClient } from "@/lib/supabase";

const DEFAULT_SUCCESS = "/payment-success";
const DEFAULT_CANCEL = "/payment-cancel";

function getBaseUrl(request: Request): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "localhost:3000";
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ message: "Stripe is not configured" }, { status: 503 });
  }

  const userId = await getAuthUserId(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: {
    productType?: string;
    amountCents?: number;
    name?: string;
    successUrl?: string;
    cancelUrl?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const productType = (body.productType ?? "payment") as StripeProductType;
  const amountCents = typeof body.amountCents === "number" ? Math.round(body.amountCents) : 999; // default $9.99
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "GarmonPay payment";
  const base = getBaseUrl(request);
  const successUrl = body.successUrl ?? `${base}${DEFAULT_SUCCESS}?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = body.cancelUrl ?? `${base}${DEFAULT_CANCEL}`;

  if (amountCents < 50) {
    return NextResponse.json({ message: "Minimum amount is $0.50" }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: "Database unavailable" }, { status: 503 });
  }

  const { data: userRow } = await supabase
    .from("users")
    .select("email")
    .eq("id", userId)
    .single();

  const email = (userRow as { email?: string } | null)?.email ?? undefined;
  if (!email) {
    return NextResponse.json({ message: "User email not found" }, { status: 400 });
  }

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: email,
      client_reference_id: userId,
      metadata: {
        user_id: userId,
        email,
        product_type: productType,
      },
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name,
              description:
                productType === "subscription"
                  ? "Subscription"
                  : productType === "platform_access"
                    ? "Platform access"
                    : productType === "upgrade"
                      ? "Upgrade"
                      : "Payment",
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
  } catch (err) {
    console.error("Stripe checkout session error:", err);
    const message = err instanceof Error ? err.message : "Failed to create checkout session";
    return NextResponse.json({ message }, { status: 500 });
  }
}
