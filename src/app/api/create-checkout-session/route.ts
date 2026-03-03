import { NextResponse } from "next/server";
import { getStripe, isStripeConfigured, type StripeProductType } from "@/lib/stripe-server";
import { createServerClient } from "@/lib/supabase";

const DEFAULT_SUCCESS = "/payment-success";
const DEFAULT_CANCEL = "/payment-cancel";

function getBearerToken(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token.length ? token : null;
}

function parseAmountCents(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.round(parsed);
    }
  }
  return null;
}

function getBaseUrl(request: Request): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (siteUrl && typeof siteUrl === "string" && siteUrl.startsWith("http")) {
    return siteUrl.replace(/\/$/, "");
  }
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "garmonpay.com";
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ message: "Stripe is not configured" }, { status: 503 });
  }

  const bearerToken = getBearerToken(request);
  if (!bearerToken) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const authClient = createServerClient(bearerToken);
  if (!authClient) {
    return NextResponse.json({ message: "Authentication unavailable" }, { status: 503 });
  }

  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const userId = user.id;
  const email = user.email ?? undefined;
  if (!email) {
    return NextResponse.json({ message: "User email not found" }, { status: 400 });
  }

  let body: {
    productType?: string;
    amountCents?: unknown;
    name?: string;
    successUrl?: string;
    cancelUrl?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
  }

  const productType = (body.productType ?? "payment") as StripeProductType;
  const amountCents = parseAmountCents(body.amountCents);
  if (amountCents === null) {
    return NextResponse.json({ message: "amountCents must be a valid number" }, { status: 400 });
  }
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "GarmonPay payment";
  const base = getBaseUrl(request);
  const successUrl = body.successUrl ?? `${base}${DEFAULT_SUCCESS}?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = body.cancelUrl ?? `${base}${DEFAULT_CANCEL}`;

  if (amountCents < 50) {
    return NextResponse.json({ message: "Minimum amount is $0.50" }, { status: 400 });
  }

  console.log("Stripe checkout user.id:", userId);
  console.log("Stripe checkout user.email:", email);
  console.log("Stripe checkout amount:", amountCents);

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
      payment_intent_data: {
        metadata: {
          user_id: userId,
        },
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
