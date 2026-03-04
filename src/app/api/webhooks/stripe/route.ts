import { NextResponse } from "next/server";
import { POST as stripeWebhookPost, GET as stripeWebhookGet } from "@/app/api/stripe/webhook/route";

/** Forward to canonical webhook: https://garmonpay.com/api/stripe/webhook */
export const runtime = "nodejs";

export async function GET() {
  return stripeWebhookGet();
}

export async function POST(req: Request) {
  return stripeWebhookPost(req);
}
