import { NextResponse } from "next/server";
import { getAuthUserIdStrict } from "@/lib/auth-request";
import { convertUSDToSC } from "@/lib/coins";

/**
 * POST /api/coins/convert
 * Body: { amountCents?: number } or { amountDollars?: number }
 */
export async function POST(request: Request) {
  const userId = await getAuthUserIdStrict(request);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: { amountCents?: unknown; amountDollars?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON" }, { status: 400 });
  }

  const amountCents =
    typeof body.amountCents === "number"
      ? Math.round(body.amountCents)
      : typeof body.amountDollars === "number"
        ? Math.round(body.amountDollars * 100)
        : 0;

  const result = await convertUSDToSC(userId, amountCents);
  if (!result.success) {
    return NextResponse.json({ message: result.message ?? "Conversion failed" }, { status: 400 });
  }

  return NextResponse.json({ success: true, scAwarded: result.scAwarded });
}
