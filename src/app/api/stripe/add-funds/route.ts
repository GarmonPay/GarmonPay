import { NextResponse } from "next/server";
import Stripe from "stripe";

export async function POST(req: Request) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret?.startsWith("sk_")) {
    return NextResponse.json(
      { error: "Stripe is not configured", url: null },
      { status: 503 }
    );
  }

  const stripe = new Stripe(secret, {
    apiVersion: "2026-01-28.clover",
  });

  const { user_id, amount } = await req.json();

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://garmonpay.com";

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: "Add Funds",
          },
          unit_amount: Number(amount) * 100,
        },
        quantity: 1,
      },
    ],
    success_url: `${baseUrl}/wallet?success=true`,
    cancel_url: `${baseUrl}/wallet`,
    metadata: {
      user_id: user_id ?? "",
    },
  });

  return NextResponse.json({ url: session.url });
}
