import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-01-28.clover",
});

export async function POST(req: Request) {
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
