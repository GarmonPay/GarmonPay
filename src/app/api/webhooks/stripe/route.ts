import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-01-28.clover",
});

export async function POST(req: Request) {
  try {
    const body = await req.text();
    const signature = req.headers.get("stripe-signature")!;
    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );

    console.log("Stripe Event:", event.type);

    switch (event.type) {
      case "checkout.session.completed":
        console.log("Payment successful");
        break;
      case "payment_intent.succeeded":
        console.log("Payment intent success");
        break;
      case "payment_intent.payment_failed":
        console.log("Payment failed");
        break;
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error(error);
    return new NextResponse("Webhook Error", { status: 400 });
  }
}
