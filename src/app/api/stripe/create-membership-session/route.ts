import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-01-28.clover",
});

export async function POST(req: Request) {
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
    success_url: "https://garmonpay.com/dashboard?upgraded=true",
    cancel_url: "https://garmonpay.com/dashboard",
  });

  return NextResponse.json({
    url: session.url,
  });
}
