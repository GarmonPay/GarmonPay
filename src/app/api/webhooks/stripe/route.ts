import { NextResponse } from "next/server";
import { POST as handleStripeWebhook } from "@/app/api/stripe-webhook/route";

/** GET /api/webhooks/stripe — health check for Stripe webhook endpoint. */
export async function GET() {
  return NextResponse.json({ status: "live" });
}

export async function POST(req: Request) {
  return handleStripeWebhook(req);
}
