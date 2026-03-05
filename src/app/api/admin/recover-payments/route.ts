import { NextResponse } from "next/server";

/**
 * POST /api/admin/recover-payments
 * Deprecated: use POST /api/admin/recover-stripe-payments instead.
 */
export async function POST(req: Request) {
  return NextResponse.json(
    {
      message: "Use POST /api/admin/recover-stripe-payments to recover and credit Stripe payments.",
      deprecated: true,
      replacement: "/api/admin/recover-stripe-payments",
    },
    { status: 410 }
  );
}
