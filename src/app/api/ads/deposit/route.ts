import { NextResponse } from "next/server";

/**
 * POST /api/ads/deposit — Disabled. Ad budget must be funded via Stripe Checkout only:
 * POST /api/ads/deposit/checkout
 */
export async function POST() {
  return NextResponse.json(
    {
      message: "Direct ad deposits are disabled. Use POST /api/ads/deposit/checkout after Stripe payment.",
    },
    { status: 410 }
  );
}
