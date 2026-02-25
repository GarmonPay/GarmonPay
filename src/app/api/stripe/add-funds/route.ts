import Stripe from "stripe";
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret?.startsWith("sk_")) {
    return NextResponse.json({ error: "Stripe is not configured", url: null }, { status: 503 });
  }
  const stripe = new Stripe(secret, {
    apiVersion: "2026-01-28.clover",
  });
  const { amount } = await req.json();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: "GarmonPay Add Funds",
          },
          unit_amount: amount * 100,
        },
        quantity: 1,
      },
    ],
    success_url: "https://garmonpay.com/wallet?success=true",
    cancel_url: "https://garmonpay.com/wallet",
  });

  return NextResponse.json({
    url: session.url,
  });
}
