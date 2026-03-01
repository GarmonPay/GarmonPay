import { NextResponse } from "next/server";
import { POST as handleStripeWebhook } from "@/app/api/stripe-webhook/route";

export async function POST(req: Request) {
  return handleStripeWebhook(req);
}
