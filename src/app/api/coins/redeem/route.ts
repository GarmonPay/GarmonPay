import { NextResponse } from "next/server";

/**
 * POST /api/coins/redeem — disabled until $GPAY SPL launch.
 * Clients should use `/dashboard/redeem` (“Coming Soon”) UI.
 */
export async function POST() {
  return NextResponse.json(
    { ok: false, message: "$GPAY redemption is not available yet." },
    { status: 503 }
  );
}
