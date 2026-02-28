import Stripe from "stripe";
import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-request";
import { createAdminClient } from "@/lib/supabase";

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
  let customer_email: string | undefined;
  if (userId) {
    const supabase = createAdminClient();
    if (supabase) {
      const { data: userRow } = await supabase.from("users").select("email").eq("id", userId).single();
      customer_email = (userRow as { email?: string } | null)?.email;
    }
  }

  const stripe = new Stripe(secret, {
    apiVersion: "2026-01-28.clover",
  });
  const domain = process.env.NEXT_PUBLIC_APP_URL || "https://garmonpay.com";
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    customer_email: customer_email,
    metadata: {
      user_id: userId ?? "",
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
    success_url: `${domain}/dashboard`,
    cancel_url: `${domain}/dashboard`,
  });

  return NextResponse.json({
    url: session.url,
  });
}
