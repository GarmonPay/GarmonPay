import Stripe from "stripe";
import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";
import { getCheckoutBaseUrl } from "@/lib/stripe-server";

export async function GET() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret?.startsWith("sk_")) {
    return NextResponse.json({ error: "Stripe is not configured", url: null }, { status: 503 });
  }
  let body: { amount?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON", url: null }, { status: 400 });
  }
  const amount = body?.amount;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 5 || amount > 1000) {
    return NextResponse.json({ error: "Amount must be between $5 and $1000 (USD)", url: null }, { status: 400 });
  }

  const userId = await getAuthUserId(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized", url: null }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Database unavailable", url: null }, { status: 503 });
  }
  const { data: userRow } = await supabase.from("users").select("email").eq("id", userId).single();
  const customer_email = (userRow as { email?: string } | null)?.email;
  if (!customer_email) {
    return NextResponse.json({ error: "User email not found", url: null }, { status: 400 });
  }

  try {
    const stripe = new Stripe(secret, {
      apiVersion: "2026-01-28.clover",
    });
    const baseUrl = getCheckoutBaseUrl(req);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email,
      client_reference_id: userId,
      metadata: {
        user_id: userId,
        email: customer_email,
        product_type: "wallet_fund",
      },
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "GarmonPay Add Funds",
            },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/dashboard?funded=true`,
      cancel_url: `${baseUrl}/dashboard`,
    });

    return NextResponse.json({
      url: session.url,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create checkout session";
    return NextResponse.json({ error: message, url: null }, { status: 500 });
  }
}
