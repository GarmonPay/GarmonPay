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

  const { tier } = await req.json();

  let price = 1900;
  let name = "Starter";

  if (tier === "pro") {
    price = 4900;
    name = "Pro";
  }

  if (tier === "elite") {
    price = 9900;
    name = "Elite";
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://garmonpay.com";

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "subscription",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `GarmonPay ${name} Membership`,
          },
          unit_amount: price,
          recurring: {
            interval: "month",
          },
        },
        quantity: 1,
      },
    ],
    success_url: `${baseUrl}/dashboard?upgraded=true`,
    cancel_url: `${baseUrl}/dashboard`,
  });

  return NextResponse.json({
    url: session.url,
  });
}
