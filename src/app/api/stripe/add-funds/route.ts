import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-01-28.clover",
});

export async function POST(req: Request) {
  const { amount } = await req.json();

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: "GarmonPay Wallet Funds",
          },
          unit_amount: amount * 100,
        },
        quantity: 1,
      },
    ],
    success_url: "https://garmonpay.com/wallet?funded=true",
    cancel_url: "https://garmonpay.com/wallet",
  });

  return NextResponse.json({
    url: session.url,
  });
}
